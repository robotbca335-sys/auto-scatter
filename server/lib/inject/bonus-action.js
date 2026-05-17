export const BONUS_ACTION_FN = async (txId, action, reason) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function isLikelyVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  }

  function megaClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ev = { bubbles: true, cancelable: true, view: window, button: 0, clientX: cx, clientY: cy };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
      try { el.dispatchEvent(new MouseEvent(t, ev)); } catch (_) {}
    });
    try { el.click(); } catch (_) {}
  }

  function svgToClickable(svg) {
    return svg.closest('button') || svg.closest('[role="button"]') || svg.parentElement;
  }

  function getRows() {
    return Array.from(document.querySelectorAll('table tbody tr')).filter(tr => tr.querySelector('td'));
  }

  function buildColMap() {
    const headers = Array.from(document.querySelectorAll('table thead th, table thead td'));
    const map = {};
    headers.forEach((th, i) => {
      const t = (th.textContent || '').toLowerCase();
      if (t.includes('kode') || t.includes('ticket')) map.tx = i;
      if (t.includes('user')) map.userId = i;
    });
    if (map.tx === undefined) map.tx = 1;
    return map;
  }

  function findRowByTxId(id) {
    const full = String(id).trim();
    const prefix = full.slice(0, 15);
    for (const row of getRows()) {
      const text = row.textContent.replace(/\s/g, '');
      if (text.includes(full) || text.includes(prefix)) return row;
    }
    return null;
  }

  function getRowCheckbox(row) {
    return row.querySelector('input[type="checkbox"]') || row.querySelector('[role="checkbox"]');
  }

  async function forceCheckboxChecked(cb) {
    if (!cb) return;
    if (!cb.checked) megaClick(cb);
    await sleep(80);
    if (!cb.checked) {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function findFloatingBulkAction(kind) {
    const all = document.querySelectorAll('button, [role="button"], a');
    for (const el of all) {
      const t = (el.textContent || '').toLowerCase();
      if (!isLikelyVisible(el)) continue;
      if (kind === 'approve' && (t.includes('setujui') || t.includes('approve'))) return el;
      if (kind === 'reject' && (t.includes('tolak') || t.includes('reject'))) return el;
    }
    return null;
  }

  function findRowAction(row, kind) {
    const cell = row.querySelector('td:nth-child(2), td:last-child') || row;
    if (kind === 'approve') {
      const up = cell.querySelector('svg.lucide-thumbs-up, svg[class*="thumbs-up"]');
      return up ? svgToClickable(up) : null;
    }
    const down = cell.querySelector('svg.lucide-thumbs-down, svg[class*="thumbs-down"]');
    return down ? svgToClickable(down) : null;
  }

  async function waitConfirm(ms = 8000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const btn = Array.from(document.querySelectorAll('button')).find(b => {
        const t = b.textContent || '';
        return isLikelyVisible(b) && (t.includes('Ya, Setujui') || t.includes('Ya, Tolak') || t.includes('Konfirmasi'));
      });
      if (btn) return btn;
      await sleep(80);
    }
    return null;
  }

  const row = findRowByTxId(txId);
  if (!row) return { ok: false, error: 'Baris tiket tidak ditemukan di BonusSMB' };

  const cb = getRowCheckbox(row);
  if (cb) await forceCheckboxChecked(cb);
  await sleep(200);

  let btn = findRowAction(row, action) || findFloatingBulkAction(action);
  if (!btn) return { ok: false, error: `Tombol ${action} tidak ditemukan` };

  megaClick(btn);
  await sleep(400);

  if (action === 'reject') {
    const textarea = document.querySelector('textarea');
    if (textarea) {
      const val = reason || 'Tidak memenuhi syarat scatter/bet/hadiah';
      textarea.value = val;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await sleep(200);
  }

  const confirm = await waitConfirm();
  if (!confirm) return { ok: false, error: 'Dialog konfirmasi tidak muncul' };
  megaClick(confirm);
  await sleep(500);
  return { ok: true };
};
