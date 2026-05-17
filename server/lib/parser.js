const DEFAULT_OPERATOR_LINE = 'bandar80';

export const DEFAULT_SCATTER_RULES = [
  { id: 1, minBet: 1600, maxBet: 2000, hadiah: { 3: 15000, 4: 30000, 5: 75000 } },
  { id: 2, minBet: 4000, maxBet: 8000, hadiah: { 3: 35000, 4: 70000, 5: 140000 } },
  { id: 3, minBet: 10000, maxBet: 18000, hadiah: { 3: 50000, 4: 100000, 5: 200000 } },
  { id: 4, minBet: 20000, maxBet: 1000000, hadiah: { 3: 100000, 4: 200000, 5: 400000 } }
];

export function normalizeCurrency(input) {
  if (!input) return '';
  const amount = String(input).replace(/[^\d]/g, '');
  if (!amount) return '';
  return `Rp ${Number(amount).toLocaleString('en-US')}`;
}

export function currencyToNumber(input) {
  if (!input) return 0;
  let s = String(input).replace(/rp/ig, '').replace(/\s+/g, '');
  if (!s) return 0;
  const hasCom = s.includes(',');
  const hasDot = s.includes('.');
  if (hasCom && hasDot) {
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (hasCom) {
    s = s.split(',').pop().length === 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    s = s.split('.').pop().length === 2 ? s : s.replace(/\./g, '');
  }
  const v = parseFloat(s.replace(/[^\d.]/g, ''));
  return isFinite(v) ? v : 0;
}

export function parseAmount(v) {
  return currencyToNumber(v);
}

export function extractScatterNum(t) {
  if (!t) return '';
  const m = String(t).match(/(\d+)/);
  return m ? m[1] : '';
}

export function extractToken(url) {
  if (!url) return '';
  const s = String(url);
  const m1 = s.match(/redirect\.html[^"'\s]*[?&]t=([A-Za-z0-9_.~-]{10,})/i);
  if (m1) return m1[1];
  const m2 = s.match(/GetBetHistory[^"'\s]*[?&]t=([^&\s"']{10,})/i);
  if (m2) return m2[1];
  const m3 = s.match(/[?&]t=([A-Za-z0-9_.~-]{10,})/i);
  return m3 ? m3[1] : '';
}

export function extractRuntimeConfigFromHistoryUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const encApi = parsed.searchParams.get('api') || '';
    const decApi = encApi ? decodeURIComponent(decodeURIComponent(encApi)) : '';
    const apiHost = decApi.split('/web-api')[0] || '';
    const tokMatch = rawUrl.match(/GetBetHistory&lang=en&t=([^&\s]+)/i) || rawUrl.match(/[?&]t=([^&\s]+)/i);
    const token = tokMatch ? tokMatch[1] : '';
    const gameIdM = parsed.pathname.match(/\/history\/(\d+)\.html/i);
    return {
      token,
      historyHost: parsed.host || '',
      apiHost,
      historyGameId: gameIdM ? gameIdM[1] : '74'
    };
  } catch {
    return null;
  }
}

export function buildCheckLink(transactionId, token, historyHost, apiHost, historyGameId) {
  if (!transactionId) return '';
  const host = historyHost || 'public.zmcyu9ypy.com';
  const api = apiHost || `public-api.${host.replace(/^public\./, '')}`;
  const gameId = historyGameId || '74';
  const encApi = encodeURIComponent(encodeURIComponent(api + '/web-api/operator-proxy/v1/History/GetBetHistory'));
  const psid = String(transactionId).slice(0, 19);
  return `https://${host}/history/${gameId}.html?psid=${psid}&sid=${psid}&gid=${gameId}&api=${encApi}&lang=en&t=${token || ''}`;
}

export function getExpectedPrizeByRule(betAmount, scatterCount, rules) {
  const bet = currencyToNumber(betAmount);
  const scatter = Number(scatterCount || 0);
  if (!bet || !scatter) return { expectedPrize: '', status: 'SKIP', ruleId: '' };
  const list = rules?.length ? rules : DEFAULT_SCATTER_RULES;
  const rule = list.find(r => bet >= r.minBet && bet <= r.maxBet);
  if (!rule) return { expectedPrize: '', status: 'RULE_NOT_FOUND', ruleId: '' };
  const expected = rule.hadiah[scatter];
  if (!expected) return { expectedPrize: '', status: 'SCATTER_NOT_FOUND', ruleId: rule.id };
  return {
    expectedPrize: normalizeCurrency(String(expected)),
    status: 'READY',
    ruleId: rule.id
  };
}

export function parseMutationBlock(block, hadiahOverride, blockIndex, rules) {
  const lines = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const operatorIdx = lines.findIndex(l => l.toLowerCase() === DEFAULT_OPERATOR_LINE);
  const userId = operatorIdx >= 0 ? (lines[operatorIdx + 1] || '') : lines[1];
  const userIdLineIdx = operatorIdx >= 0 ? operatorIdx + 1 : 1;

  const gameIdx = lines.findIndex((l, i) => i !== userIdLineIdx && l.toUpperCase().startsWith('MAHJONG'));
  const ticketLine = gameIdx >= 0 ? (lines[gameIdx + 1] || '') : '';
  const ticketMatch = ticketLine.match(/(\d{10,})/);
  const transactionId = ticketMatch ? ticketMatch[1] : '';

  let betAmount = '';
  const betInTicket = ticketLine.match(/Rp\s*([\d.,]+)/i);
  if (betInTicket) betAmount = normalizeCurrency(`Rp ${betInTicket[1]}`);
  else if (gameIdx >= 0 && lines[gameIdx + 2]) {
    const betNext = lines[gameIdx + 2].match(/Rp\s*([\d.,]+)/i);
    if (betNext) betAmount = normalizeCurrency(`Rp ${betNext[1]}`);
  }
  if (!betAmount && gameIdx >= 0) {
    for (let i = gameIdx + 1; i < Math.min(gameIdx + 5, lines.length); i++) {
      const bm = lines[i].match(/Rp\s*([\d.,]+)/i);
      if (bm) { betAmount = normalizeCurrency(`Rp ${bm[1]}`); break; }
    }
  }

  const scatterLine = lines.find(l => /^x\s*\d+$/i.test(l) || /^\d+\s*x$/i.test(l) || /^x\d+$/i.test(l));
  let scatterCount = scatterLine ? scatterLine.replace(/[xX\s]/g, '').trim() : '';
  if (!scatterCount) {
    for (const l of lines) {
      const sm = l.match(/(\d+)\s*scatter|scatter\s*(\d+)/i);
      if (sm) { scatterCount = sm[1] || sm[2]; break; }
    }
  }

  const livechatIdx = lines.findIndex(l => l.toUpperCase() === 'LIVECHAT');
  let totalPrize = '';
  if (livechatIdx > -1 && scatterLine) {
    const scatterIdx = lines.findIndex(l => l === scatterLine);
    if (scatterIdx > -1 && livechatIdx > scatterIdx + 1) totalPrize = normalizeCurrency(lines[scatterIdx + 1]);
  }
  if (!totalPrize) {
    const rpLines = lines.filter(l => /Rp\s*[\d.,]+/i.test(l));
    if (rpLines.length > 1) totalPrize = normalizeCurrency(rpLines[rpLines.length - 1]);
  }
  if (hadiahOverride) totalPrize = normalizeCurrency(hadiahOverride);

  const expected = getExpectedPrizeByRule(betAmount, scatterCount, rules);
  const totalPrizeNum = currencyToNumber(totalPrize);
  const expectedPrizeNum = currencyToNumber(expected.expectedPrize);
  const hadiahStatus = expected.status !== 'READY'
    ? expected.status
    : (totalPrizeNum === expectedPrizeNum ? 'VALID' : 'TIDAK_VALID');

  return {
    userId: userId || `UNKNOWN_USER_${blockIndex + 1}`,
    transactionId: transactionId || `INVALID_TX_${Date.now()}_${blockIndex + 1}`,
    betAmount,
    scatterCount,
    rawMutation: block,
    totalPrize,
    expectedPrize: expected.expectedPrize,
    ruleId: expected.ruleId,
    hadiahStatus,
    processable: Boolean(userId && transactionId)
  };
}

export function parseMutationData(raw, hadiahOverride, rules) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const parsed = [];
  const unreadable = [];

  blocks.forEach((block, i) => {
    const row = parseMutationBlock(block, hadiahOverride, i, rules);
    if (row) {
      if (!row.processable) unreadable.push(`Blok #${i + 1}: userId/transactionId tidak lengkap.`);
      parsed.push(row);
    } else {
      unreadable.push(`Blok #${i + 1}: format tidak dikenali.`);
    }
  });

  if (parsed.length > 0) return { parsed, skippedCount: 0, unreadableNotes: unreadable };

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const fallback = lines.map((line, i) => {
    const parts = line.split(/\s+/).map(p => p.trim());
    if (parts.length < 2) { unreadable.push(`Baris #${i + 1}: tidak ada userId + transactionId.`); return null; }
    return {
      userId: parts[0],
      transactionId: parts[1],
      betAmount: '',
      scatterCount: '',
      rawMutation: line,
      totalPrize: hadiahOverride ? normalizeCurrency(hadiahOverride) : '',
      expectedPrize: '',
      ruleId: '',
      hadiahStatus: 'SKIP',
      processable: true
    };
  }).filter(Boolean);

  return { parsed: fallback, skippedCount: 0, unreadableNotes: unreadable };
}

export function buildRejectReason(betCheckStatus, scatterCheckStatus, hadiahStatus, debetValue, scatterTitle, expectedPrize) {
  const parts = [];
  if (betCheckStatus === 'TIDAK_SESUAI') parts.push(`Bet admin (${debetValue || 'N/A'}) tidak sesuai mutasi`);
  if (scatterCheckStatus === 'TIDAK_SESUAI') parts.push(`Scatter detail (${scatterTitle || '-'}) tidak sesuai mutasi`);
  if (hadiahStatus && !['VALID', 'READY', 'SKIP'].includes(String(hadiahStatus).toUpperCase())) {
    parts.push(`Hadiah: ${hadiahStatus} (rule: ${expectedPrize || '-'})`);
  }
  return parts.length ? parts.join(' | ') : 'Tidak memenuhi syarat scatter/bet/hadiah';
}

export function shouldApproveFromResult(msg) {
  const overall = String(msg?.overallStatus || '').toUpperCase().trim();
  const bet = String(msg?.betCheckStatus || '').toUpperCase().trim();
  const sc = String(msg?.scatterCheckStatus || '').toUpperCase().trim();
  const had = String(msg?.hadiahStatus || '').toUpperCase().trim();
  const title = String(msg?.scatterTitle || '').toLowerCase();

  if (title.includes('session timeout') || (title.includes('timeout') && !title.includes('menunggu')) || overall.includes('TIMEOUT')) {
    return 'SESSION_TIMEOUT';
  }
  if (overall === 'RETRY' || title.includes('detail_processor') || title.includes('tidak merespons')
      || title.includes('error detail') || title.includes('tab detail tidak') || title.includes('content script')) {
    return 'RETRY';
  }
  if (overall.includes('TIDAK')) return false;
  if (bet.includes('TIDAK')) return false;
  if (sc.includes('TIDAK')) return false;
  if (had.includes('TIDAK') || had.includes('NOT')) return false;
  if (title.includes('no_data') || title.includes('no data')) return false;
  if (title.includes('tidak ditemukan') || title.includes('error')) return false;
  return overall === 'SESUAI';
}
