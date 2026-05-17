import { parseAmount, extractScatterNum } from './parser.js';

export function finalizeRow(meta, result, executorName, adminUrl, todayDate) {
  const row = {
    ...meta,
    ...result,
    scatterCount: result.scatterCount || meta.scatterCount || '',
    totalPrize: result.totalPrize || meta.totalPrize || '',
    debetValue: result.debetValue || meta.betAmount || 'N/A',
    checkLink: result.checkLink || meta.checkLink || '',
    executorName: executorName || 'Unknown',
    adminUrl: adminUrl || '',
    todayDate: todayDate || new Date().toISOString().slice(0, 10)
  };

  const bm = parseAmount(row.betAmount);
  const ba = parseAmount(row.debetValue);
  row.betCheckStatus = (!bm || !ba) ? 'UNKNOWN' : bm === ba ? 'SESUAI' : 'TIDAK_SESUAI';

  const sm = String(row.scatterCount || '');
  const sd = extractScatterNum(row.scatterTitle);
  row.scatterCheckStatus = (!sm || !sd) ? 'UNKNOWN' : sm === sd ? 'SESUAI' : 'TIDAK_SESUAI';

  const scatterT = String(row.scatterTitle || '');
  const scatterLow = scatterT.toLowerCase();
  if (scatterLow.includes('detail_processor') || scatterLow.includes('tidak merespons')
      || scatterLow.includes('error detail') || scatterLow.includes('tab detail tidak')
      || scatterLow.includes('content script')) {
    row.overallStatus = 'RETRY';
    row.scatterTitle = scatterT;
  } else if (scatterT.toUpperCase().includes('NO_DATA')) {
    row.scatterTitle = 'NO_DATA';
    row.betCheckStatus = 'TIDAK_SESUAI';
    row.scatterCheckStatus = 'TIDAK_SESUAI';
    row.hadiahStatus = 'TIDAK_SESUAI';
    row.overallStatus = 'TIDAK_SESUAI';
  } else {
    const betOk = row.betCheckStatus === 'SESUAI';
    const scOk = row.scatterCheckStatus === 'SESUAI';
    const hadiahOk = String(row.hadiahStatus || '').toUpperCase() === 'VALID';
    row.overallStatus = (betOk && scOk && hadiahOk) ? 'SESUAI' : 'TIDAK_SESUAI';
  }

  return row;
}
