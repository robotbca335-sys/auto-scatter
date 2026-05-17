import { mergeAdminHeaders } from './admin-headers.js';

export const BANDAR80_ORIGIN = 'https://bandar80.idrbo2.com';
export const BANDAR80_ADMIN_PAGE = '/transaction-record.html';
export const BANDAR80_API_BASE = '/game-oc/';
export const BANDAR80_TX_LIST =
  'ida/transaction/history/queryTransactionHistoryListForUser';

export function isBandar80Target(adminUrl) {
  if (!adminUrl) return false;
  try {
    const h = new URL(String(adminUrl).trim()).hostname.toLowerCase();
    return h.includes('idrbo2.com') || h.includes('bandar80');
  } catch {
    return String(adminUrl).toLowerCase().includes('bandar80')
      || String(adminUrl).toLowerCase().includes('idrbo2');
  }
}

export function bandar80Origin(settings) {
  const raw = String(settings?.adminUrl || BANDAR80_ORIGIN).trim();
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).origin;
  } catch {
    return BANDAR80_ORIGIN;
  }
}

export function buildBandar80ListUrl(settings) {
  const origin = bandar80Origin(settings);
  const apiBase = settings?.adminApiBase
    || `${origin}${BANDAR80_API_BASE}`;
  const path = (settings?.adminApiPath || BANDAR80_TX_LIST).replace(/^\//, '');
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  return new URL(path, base).toString();
}

export async function fetchBandar80Transaction(settings, userId, transactionId, startDate, endDate) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    ...mergeAdminHeaders(settings)
  };
  if (!headers['X-Access-Token']) return null;

  const url = buildBandar80ListUrl(settings);
  const txKey = `${transactionId}-${transactionId}-106-0`;
  const params = new URLSearchParams({
    userId: String(userId || ''),
    transactionId: txKey,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    endDate: endDate || new Date().toISOString().slice(0, 10),
    pageNo: '1',
    pageSize: '300',
    gameCategory: '',
    gameType: '',
    gameId: ''
  });

  const res = await fetch(`${url}?${params}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(28000)
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.success || !Array.isArray(data?.result?.records)) return null;
  if (!data.result.records.length) return { ok: false, scatterTitle: 'NO_DATA', debetValue: 'N/A', gameName: '' };

  const txShort = String(transactionId).slice(0, 19);
  let betRow = null;

  for (const row of data.result.records) {
    const kid = String(row.keteranganId || row.transactionId || '').replace(/\s/g, '');
    const match = kid.includes(txShort) || txShort.includes(kid.slice(0, 15));
    if (!match) continue;
    if (row.status === '03' || String(row.status).toLowerCase().includes('pertaruhan')) {
      betRow = row;
      break;
    }
    if (!betRow) betRow = row;
  }

  if (!betRow) return { ok: false, scatterTitle: 'Transaksi tidak ditemukan di API', debetValue: 'N/A', gameName: '' };

  const debetRaw = betRow.debet ?? betRow.debit ?? betRow.betAmount ?? 0;
  const debetValue = typeof debetRaw === 'number'
    ? debetRaw.toLocaleString('en-US')
    : String(debetRaw || '0');

  const gameName = String(betRow.gameName || betRow.gameId || betRow.gameType || '74');

  return {
    ok: true,
    debetValue,
    gameName,
    captured: [],
    tokenFound: '',
    viaApi: true
  };
}

export function bandar80AuthForStorage(headers) {
  return {
    token: headers['X-Access-Token'] || '',
    pkid: headers['X-Agent-Pkid'] || '',
    role: headers['X-Agent-Role'] || '',
    suid: headers['X-Agent-Suid'] || '',
    user: headers['X-Agent-User'] || '',
    userId: headers['X-Agent-UserId'] || ''
  };
}
