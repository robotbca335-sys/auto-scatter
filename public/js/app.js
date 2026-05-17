const $ = id => document.getElementById(id);

let latestResults = [];
let scatterRules = [];
let evtSource = null;
let headersVersion = 0;
let currentTarget = '';

const today = () => new Date().toISOString().slice(0, 10);
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE.replace(/\/$/, '') : '';

function apiUrl(path) {
  return API_BASE + path;
}

async function api(path, opts = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setStatus(msg) {
  const el = $('status');
  if (el) el.textContent = msg;
}

function setEngineTag(msg) {
  const el = $('engineTag');
  if (el) el.textContent = msg;
}

function normalizeTargetUrl(url) {
  if (!url || !String(url).trim()) return '';
  try {
    return new URL(String(url).trim()).origin.toLowerCase();
  } catch {
    return String(url).trim().replace(/\/$/, '').toLowerCase();
  }
}

function formatSyncTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

function updateHeadersSyncUI(sync, fromRemote = false) {
  const el = $('headersSyncStatus');
  if (!el) return;
  if (!sync || !sync.target) {
    el.textContent = 'Belum ada header bersama — isi header lalu klik sync.';
    el.classList.remove('live', 'flash');
    return;
  }
  headersVersion = sync.version || headersVersion;
  currentTarget = sync.target;
  el.textContent = `Target: ${sync.target} | v${sync.version || 0} | ${formatSyncTime(sync.updatedAt)} | oleh ${sync.updatedBy || '-'}`;
  el.classList.add('live');
  if (fromRemote) {
    el.classList.add('flash');
    const ta = $('adminHeadersRaw');
    if (ta) {
      ta.classList.add('sync-pulse');
      setTimeout(() => ta.classList.remove('sync-pulse'), 1300);
    }
    setTimeout(() => el.classList.remove('flash'), 1300);
  }
}

function applyConfigSync(data, fromRemote = true) {
  const myTarget = normalizeTargetUrl($('adminUrl').value);
  if (!data?.target || (myTarget && data.target !== myTarget)) return false;
  if (fromRemote && data.version && data.version <= headersVersion) return false;

  if (data.adminHeadersRaw) $('adminHeadersRaw').value = data.adminHeadersRaw;
  if (data.adminApiPath) $('adminApiPath').value = data.adminApiPath;
  updateHeadersSyncUI(data, fromRemote);
  if (fromRemote) {
    setStatus(`Header diperbarui oleh ${data.updatedBy || 'operator lain'} (v${data.version}) — semua user disinkronkan.`);
  }
  return true;
}

function renderCounters(stats = {}) {
  $('counterTotal').textContent = stats.totalInput ?? 0;
  $('counterProcessed').textContent = stats.processed ?? 0;
  $('counterTimeout').textContent = stats.timeout ?? 0;
  $('counterInvalid').textContent = stats.invalid ?? 0;
}

function normalizeHadiah(item) {
  const raw = String(item.hadiahStatus || '').toUpperCase();
  if (raw === 'VALID') return 'SESUAI';
  if (raw === 'TIDAK_VALID') return 'TIDAK SESUAI';
  return raw || '-';
}

function overallLabel(item) {
  const betOk = item.betCheckStatus === 'SESUAI';
  const scOk = item.scatterCheckStatus === 'SESUAI';
  const had = normalizeHadiah(item);
  const hadOk = had === 'SESUAI';
  if (betOk && scOk && hadOk) return 'SESUAI';
  return 'TIDAK SESUAI';
}

function renderTable(rows) {
  latestResults = rows || [];
  const tbody = $('resultBody');
  if (!rows?.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="14">Belum ada data</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((item, i) => {
    const overall = overallLabel(item);
    const pass = overall === 'SESUAI';
    const cls = pass ? 'row-pass' : 'row-fail';
    const betCls = item.betCheckStatus === 'SESUAI' ? 'cell-ok' : 'cell-fail';
    const scCls = item.scatterCheckStatus === 'SESUAI' ? 'cell-ok' : 'cell-fail';
    return `<tr class="${cls}">
      <td>${i + 1}</td>
      <td>${item.userId || '-'}</td>
      <td><small>${item.transactionId || '-'}</small></td>
      <td>${item.betAmount || '-'}</td>
      <td>${item.debetValue || '-'}</td>
      <td class="${betCls}">${item.betCheckStatus || '-'}</td>
      <td>${item.scatterCount || '-'}</td>
      <td>${item.scatterTitle || '-'}</td>
      <td class="${scCls}">${item.scatterCheckStatus || '-'}</td>
      <td>${item.totalPrize || '-'}</td>
      <td>${item.expectedPrize || '-'}</td>
      <td>${normalizeHadiah(item)}</td>
      <td>${item.bonusAction || '-'}</td>
      <td class="${pass ? 'cell-ok' : 'cell-fail'}">${overall}</td>
    </tr>`;
  }).join('');
}

function renderRulesTable() {
  const body = $('rulesBody');
  body.innerHTML = scatterRules.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><input type="number" data-i="${i}" data-k="minBet" value="${r.minBet}"></td>
      <td><input type="number" data-i="${i}" data-k="maxBet" value="${r.maxBet}"></td>
      <td><input type="number" data-i="${i}" data-k="h3" value="${r.hadiah[3] || 0}"></td>
      <td><input type="number" data-i="${i}" data-k="h4" value="${r.hadiah[4] || 0}"></td>
      <td><input type="number" data-i="${i}" data-k="h5" value="${r.hadiah[5] || 0}"></td>
      <td><button type="button" class="btn btn-muted" data-del="${i}" style="padding:6px 10px">×</button></td>
    </tr>
  `).join('');
}

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource(apiUrl('/api/events'));
  evtSource.addEventListener('connected', e => {
    const st = JSON.parse(e.data);
    renderTable(st.results);
    renderCounters(st.stats);
    $('connBadge').textContent = 'LIVE';
    $('connBadge').className = 'badge badge-live';
    setEngineTag(st.running ? 'Engine running' : 'Engine idle');
    if (st.headersSync) updateHeadersSyncUI(st.headersSync, false);
  });
  evtSource.addEventListener('configSync', e => {
    const data = JSON.parse(e.data);
    applyConfigSync(data, true);
  });
  evtSource.addEventListener('status', e => {
    const d = JSON.parse(e.data);
    setStatus(d.message);
  });
  evtSource.addEventListener('row', e => {
    const row = JSON.parse(e.data);
    latestResults = [...latestResults, row];
    renderTable(latestResults);
  });
  evtSource.addEventListener('batchStart', e => {
    const d = JSON.parse(e.data);
    latestResults = [];
    renderTable([]);
    setStatus(`Memproses ${d.total} tiket…`);
    setEngineTag('Engine running');
    $('startBtn').disabled = true;
  });
  evtSource.addEventListener('batchDone', e => {
    const d = JSON.parse(e.data);
    renderCounters(d.stats);
    renderTable(d.results);
    setStatus('Selesai.');
    setEngineTag('Engine idle');
    $('startBtn').disabled = false;
    $('txData').value = '';
  });
  evtSource.addEventListener('cleared', () => {
    latestResults = [];
    renderTable([]);
    renderCounters({ totalInput: 0, processed: 0, timeout: 0, invalid: 0 });
  });
  evtSource.onerror = () => {
    $('connBadge').textContent = 'OFF';
    $('connBadge').className = 'badge badge-off';
    setTimeout(connectSSE, 3000);
  };
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

async function loadSharedHeadersForUrl(adminUrl) {
  if (!adminUrl?.trim()) return;
  const data = await api('/api/headers/shared?adminUrl=' + encodeURIComponent(adminUrl.trim()));
  if (data.adminHeadersRaw) $('adminHeadersRaw').value = data.adminHeadersRaw;
  if (data.adminApiPath) $('adminApiPath').value = data.adminApiPath;
  updateHeadersSyncUI(data.headersSync || { target: data.target, ...data.headersSync }, false);
}

async function loadSettings() {
  const s = await api('/api/settings');
  $('adminUrl').value = s.adminUrl || 'https://bandar80.idrbo2.com';
  if ($('adminApiBase')) $('adminApiBase').value = s.adminApiBase || 'https://bandar80.idrbo2.com/game-oc/';
  $('adminApiPath').value = s.adminApiPath || 'ida/transaction/history/queryTransactionHistoryListForUser';
  $('adminHeadersRaw').value = s.adminHeadersRaw || '';
  if (s.headersSync) updateHeadersSyncUI(s.headersSync, false);
  else if (s.adminUrl) await loadSharedHeadersForUrl(s.adminUrl).catch(() => {});
  $('token').value = s.token || '';
  $('executorName').value = s.executorName || '';
  $('historyUrlInput').value = s.historyUrl || '';
  $('hadiahOverride').value = s.hadiahOverride || '';
  $('startDateInput').value = s.startDate || today();
  $('endDateInput').value = s.endDate || today();
  $('autoBonus').checked = !!s.autoBonus;
  $('bonusUrl').value = s.bonusUrl || 'https://bonussmb.com/tickets';
  if (s.hasBonusCookies) {
    $('bonusCookies').placeholder = 'Cookie tersimpan di server — kosongkan field ini untuk tetap memakai yang lama, atau tempel baru untuk ganti';
    $('bonusCookies').value = '';
  }
  scatterRules = s.scatterRules || [];
  renderRulesTable();
  document.body.className = 'theme-' + (s.uiTheme || 'obsidian');
  $('themeSelect').value = s.uiTheme || 'obsidian';
}

async function saveSettings(partial) {
  const res = await api('/api/settings', { method: 'POST', body: JSON.stringify(partial) });
  if (res.sync) applyConfigSync(res.sync, false);
  if (res.settings?.headersSync) updateHeadersSyncUI(res.settings.headersSync, false);
  setStatus('Pengaturan disimpan.');
  return res;
}

$('themeSelect').addEventListener('change', () => {
  const t = $('themeSelect').value;
  document.body.className = 'theme-' + t;
  saveSettings({ uiTheme: t });
});

$('saveAdminBtn').addEventListener('click', () => {
  saveSettings({
    adminUrl: $('adminUrl').value.trim(),
    adminApiBase: $('adminApiBase') ? $('adminApiBase').value.trim() : '',
    adminApiPath: $('adminApiPath').value.trim(),
    token: $('token').value.trim(),
    executorName: $('executorName').value.trim(),
    historyUrl: $('historyUrlInput').value.trim(),
    startDate: $('startDateInput').value,
    endDate: $('endDateInput').value,
    hadiahOverride: $('hadiahOverride').value.trim()
  });
});

$('saveHeadersSyncBtn').addEventListener('click', async () => {
  const adminUrl = $('adminUrl').value.trim();
  const adminHeadersRaw = $('adminHeadersRaw').value.trim();
  if (!adminUrl) {
    setStatus('Isi URL Dasar Admin dulu (ini menentukan target sync).');
    return;
  }
  if (!adminHeadersRaw) {
    setStatus('Isi header API terlebih dahulu.');
    return;
  }
  try {
    const res = await api('/api/headers/sync', {
      method: 'POST',
      body: JSON.stringify({
        adminUrl,
        adminHeadersRaw,
        adminApiBase: $('adminApiBase') ? $('adminApiBase').value.trim() : '',
        adminApiPath: $('adminApiPath').value.trim(),
        executorName: $('executorName').value.trim() || 'Operator'
      })
    });
    applyConfigSync(res.sync, false);
    setStatus(`Header v${res.sync?.version || '?'} disimpan — semua pengguna dengan target sama akan ter-update.`);
  } catch (e) {
    setStatus('Gagal sync: ' + e.message);
  }
});

$('reloadHeadersBtn').addEventListener('click', async () => {
  const adminUrl = $('adminUrl').value.trim();
  if (!adminUrl) {
    setStatus('Isi URL admin dulu.');
    return;
  }
  try {
    await loadSharedHeadersForUrl(adminUrl);
    setStatus('Header dimuat dari server bersama.');
  } catch (e) {
    setStatus('Gagal muat: ' + e.message);
  }
});

let adminUrlDebounce;
$('adminUrl').addEventListener('input', () => {
  clearTimeout(adminUrlDebounce);
  adminUrlDebounce = setTimeout(() => {
    const url = $('adminUrl').value.trim();
    if (url) loadSharedHeadersForUrl(url).catch(() => {});
  }, 500);
});

$('saveBonusBtn').addEventListener('click', () => {
  const cookies = $('bonusCookies').value.trim();
  if (cookies === '[tersimpan]') {
    saveSettings({ autoBonus: $('autoBonus').checked, bonusUrl: $('bonusUrl').value.trim() });
    return;
  }
  saveSettings({
    autoBonus: $('autoBonus').checked,
    bonusUrl: $('bonusUrl').value.trim(),
    bonusCookies: cookies
  });
});

$('rulesBody').addEventListener('input', e => {
  const t = e.target;
  const i = Number(t.dataset.i);
  const k = t.dataset.k;
  if (isNaN(i) || !k) return;
  const v = Number(t.value || 0);
  if (k === 'minBet' || k === 'maxBet') scatterRules[i][k] = v;
  else if (k.startsWith('h')) scatterRules[i].hadiah[Number(k.slice(1))] = v;
});

$('rulesBody').addEventListener('click', e => {
  const del = e.target.dataset.del;
  if (del === undefined) return;
  scatterRules = scatterRules.filter((_, i) => i !== Number(del));
  renderRulesTable();
});

$('addRuleBtn').addEventListener('click', () => {
  scatterRules.push({ id: Date.now(), minBet: 0, maxBet: 0, hadiah: { 3: 0, 4: 0, 5: 0 } });
  renderRulesTable();
});

$('saveRulesBtn').addEventListener('click', () => saveSettings({ scatterRules }));

$('startBtn').addEventListener('click', async () => {
  const mutation = $('txData').value.trim();
  if (!mutation) {
    setStatus('Tempel data mutasi terlebih dahulu.');
    return;
  }
  try {
    await saveSettings({
      adminUrl: $('adminUrl').value.trim(),
      adminApiBase: $('adminApiBase') ? $('adminApiBase').value.trim() : '',
      adminApiPath: $('adminApiPath').value.trim(),
      token: $('token').value.trim(),
      executorName: $('executorName').value.trim(),
      historyUrl: $('historyUrlInput').value.trim(),
      startDate: $('startDateInput').value,
      endDate: $('endDateInput').value,
      hadiahOverride: $('hadiahOverride').value.trim(),
      scatterRules
    });
    await api('/api/process', {
      method: 'POST',
      body: JSON.stringify({
        mutation,
        hadiahOverride: $('hadiahOverride').value.trim()
      })
    });
    setStatus('Proses dimulai di server…');
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
});

$('clearBtn').addEventListener('click', async () => {
  await api('/api/clear', { method: 'POST' });
  setStatus('Data dihapus.');
});

$('copyBtn').addEventListener('click', () => {
  if (!latestResults.length) {
    setStatus('Tidak ada data untuk disalin.');
    return;
  }
  const lines = latestResults.map((r, i) =>
    [i + 1, r.userId, r.transactionId, r.betAmount, r.debetValue, r.betCheckStatus,
      r.scatterCount, r.scatterTitle, r.scatterCheckStatus, r.totalPrize, r.expectedPrize,
      normalizeHadiah(r), overallLabel(r)].join('\t')
  );
  navigator.clipboard.writeText(lines.join('\n')).then(() => setStatus(`Disalin ${latestResults.length} baris.`));
});

initTabs();
connectSSE();
loadSettings().catch(e => setStatus('Gagal load settings: ' + e.message));
