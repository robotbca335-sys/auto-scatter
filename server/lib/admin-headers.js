import { fetchBandar80Transaction, isBandar80Target } from './bandar80-api.js';

export function parseAgentHeaders(raw) {
  if (!raw || !String(raw).trim()) return {};
  const headers = {};
  let text = String(raw).trim();

  const lineParts = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lineParts.length > 1) {
    for (const line of lineParts) {
      const m = line.match(/^(X-[A-Za-z-]+)\s+(.+)$/i);
      if (m) headers[m[1]] = m[2].trim();
    }
    if (Object.keys(headers).length) return headers;
  }

  const chunks = text.split(/\s+(?=X-)/i).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^(X-[A-Za-z-]+)\s+([\s\S]+)$/i);
    if (m) headers[m[1]] = m[2].trim();
  }

  if (!headers['X-Access-Token']) {
    const tok = text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (tok) headers['X-Access-Token'] = tok[0];
  }

  return headers;
}

export function headersFromEnv() {
  const h = {};
  if (process.env.ADMIN_ACCESS_TOKEN) h['X-Access-Token'] = process.env.ADMIN_ACCESS_TOKEN;
  if (process.env.X_AGENT_PKID) h['X-Agent-Pkid'] = process.env.X_AGENT_PKID;
  if (process.env.X_AGENT_ROLE) h['X-Agent-Role'] = process.env.X_AGENT_ROLE;
  if (process.env.X_AGENT_SUID) h['X-Agent-Suid'] = process.env.X_AGENT_SUID;
  if (process.env.X_AGENT_USER) h['X-Agent-User'] = process.env.X_AGENT_USER;
  if (process.env.X_AGENT_USER_ID) h['X-Agent-UserId'] = process.env.X_AGENT_USER_ID;
  if (process.env.ADMIN_HEADERS_RAW) Object.assign(h, parseAgentHeaders(process.env.ADMIN_HEADERS_RAW));
  return h;
}

export function mergeAdminHeaders(settings = {}) {
  const fromEnv = headersFromEnv();
  const fromSettings = parseAgentHeaders(settings.adminHeadersRaw || '');
  return { ...fromSettings, ...fromEnv };
}

export async function fetchAdminTransaction(settings, userId, transactionId, startDate, endDate) {
  if (isBandar80Target(settings?.adminUrl)) {
    return fetchBandar80Transaction(settings, userId, transactionId, startDate, endDate);
  }

  const base = String(settings.adminUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('adminUrl kosong');

  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    ...mergeAdminHeaders(settings)
  };

  if (!headers['X-Access-Token']) return null;

  const paths = [
    settings.adminApiPath,
    '/api/transaction-record/list',
    '/api/cashier/transaction-record',
    '/api/v1/transaction/record',
    '/web-api/cashier/transaction-record'
  ].filter(Boolean);

  const txKey = `${transactionId}-${transactionId}-106-0`;
  const bodies = [
    { userId, transactionId: txKey, startDate, endDate },
    { userId, transactionId, startDate, endDate },
    { user_id: userId, transaction_id: transactionId, start_date: startDate, end_date: endDate }
  ];

  for (const path of paths) {
    const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? path : '/' + path}`;
    for (const body of bodies) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000)
        });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = normalizeApiRows(data, transactionId);
        if (parsed) return parsed;
      } catch (_) {}
    }
  }
  return null;
}

function normalizeApiRows(data, transactionId) {
  const rows = data?.data?.list || data?.data?.records || data?.data || data?.list || data?.records;
  if (!Array.isArray(rows)) return null;
  const txShort = String(transactionId).slice(0, 19);

  for (const row of rows) {
    const id = String(row.transactionId || row.transaction_id || row.psid || row.ticketId || '');
    if (!id.includes(txShort) && !txShort.includes(id.slice(0, 15))) continue;

    const status = String(row.status || row.betStatus || '').toLowerCase();
    const debet = row.debet || row.debit || row.betAmount || row.amount || row.debetValue;
    const gameName = row.gameId || row.game_id || row.gid || row.gameName || row.game_name;

    if (status.includes('pertaruhan') || status.includes('bet') || status.includes('debit') || debet) {
      return {
        debetValue: debet != null ? String(debet) : '0',
        gameName: gameName != null ? String(gameName) : '',
        tokenFound: row.token || row.historyToken || ''
      };
    }
  }

  const first = rows[0];
  if (first) {
    return {
      debetValue: String(first.debet || first.debit || first.betAmount || '0'),
      gameName: String(first.gameId || first.game_id || first.gid || '74'),
      tokenFound: first.token || ''
    };
  }
  return null;
}
