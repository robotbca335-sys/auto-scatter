export const DETAIL_CHECK_FN = async () => {
  const NEXT_BTN = '.detail-navigation.right';

  function waitElement(selector, timeout = 5000) {
    return new Promise(resolve => {
      if (document.querySelector(selector)) { resolve(true); return; }
      let resolved = false;
      const finish = result => {
        if (resolved) return;
        resolved = true;
        obs.disconnect();
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish(false), timeout);
      const obs = new MutationObserver(() => {
        if (document.querySelector(selector)) finish(true);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function getRoundInfo() {
    const el = document.querySelector('.result-detail-item.round-title');
    if (!el) return { total: 1, current: 1 };
    const text = el.textContent.trim();
    const tot = text.match(/\/\s*(\d+)/);
    const cur = text.match(/Round\s*(\d+)/i) || text.match(/^(\d+)\s*\/\s*\d+/);
    return { total: tot ? parseInt(tot[1]) : 1, current: cur ? parseInt(cur[1]) : 1 };
  }

  function clickNextRound() {
    const btn = document.querySelector(NEXT_BTN);
    if (!btn) return false;
    const href = btn.getAttribute('href') || '';
    if (href.trim().toLowerCase().startsWith('javascript:')) btn.removeAttribute('href');
    btn.click();
    if (href.trim().toLowerCase().startsWith('javascript:')) btn.setAttribute('href', href);
    return true;
  }

  function checkScatterFound() {
    const base = { scatterTitle: 'Scatter tidak ditemukan' };
    const el = document.querySelector('.sprite-symbol.payout_scatter');
    if (!el) {
      for (const item of document.querySelectorAll('.payout-item-container')) {
        const label = (item.querySelector('.payout-item-title') || {}).textContent || '';
        const hasScatter = item.innerHTML.toLowerCase().includes('scatter') || label.toLowerCase().includes('scatter');
        if (hasScatter) {
          const title = label.trim().replace(/x/gi, '').trim() || 'Ditemukan';
          return { ok: true, scatterTitle: title };
        }
      }
      return { ok: false, ...base };
    }
    const container = el.closest('.payout-item-container');
    let title = 'Ditemukan';
    if (container) {
      const t = container.querySelector('.payout-item-label .payout-item-title')
        || container.querySelector('.payout-item-title');
      if (t) title = t.textContent.trim().replace(/x/gi, '').trim() || 'Ditemukan';
    }
    return { ok: true, scatterTitle: title };
  }

  function getBodyText() {
    try {
      const el = document.evaluate('/html/body/div', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      return el ? el.textContent.trim() : document.body.textContent || '';
    } catch {
      return document.body ? document.body.textContent : '';
    }
  }

  function waitUntilReady(timeout = 8000) {
    return new Promise(resolve => {
      const CONTENT_SELECTORS = [NEXT_BTN, '.result-detail-item', '.payout-item-container', '.sprite-symbol'];
      const isReady = () => {
        const txt = getBodyText().toLowerCase();
        if (txt.includes('loading') || txt.includes('memuat')) return false;
        if (document.readyState !== 'complete') return CONTENT_SELECTORS.some(sel => document.querySelector(sel));
        return true;
      };
      if (isReady()) { resolve(true); return; }
      let resolved = false;
      let pollId;
      const finish = result => {
        if (resolved) return;
        resolved = true;
        obs.disconnect();
        clearTimeout(timer);
        clearInterval(pollId);
        resolve(result);
      };
      const timer = setTimeout(() => finish(false), timeout);
      const obs = new MutationObserver(() => { if (isReady()) finish(true); });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      pollId = setInterval(() => { if (isReady()) finish(true); }, 80);
    });
  }

  function waitForRoundChange(prevCurrent, timeout = 5000) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = result => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        clearTimeout(safeTimer);
        clearInterval(pollTimer);
        resolve(result);
      };
      const safeTimer = setTimeout(() => finish(false), timeout);
      const target = document.querySelector('.result-detail-item.round-title')
        || document.querySelector('.result-detail-item') || document.body;
      const observer = new MutationObserver(() => {
        const { current } = getRoundInfo();
        if (current !== prevCurrent) finish(true);
      });
      observer.observe(target, { childList: true, subtree: true, characterData: true });
      const pollTimer = setInterval(() => {
        const { current } = getRoundInfo();
        if (current !== prevCurrent) { finish(true); return; }
        const txt = getBodyText().toLowerCase();
        if (!txt.includes('loading') && !txt.includes('memuat') && getRoundInfo().current !== prevCurrent) finish(true);
      }, 40);
    });
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  if (getBodyText().toLowerCase().includes('session timeout')) {
    return { ok: false, scatterTitle: 'SESSION TIMEOUT' };
  }

  await waitUntilReady(8000);
  const first = checkScatterFound();
  if (first.ok) return first;

  const hasRound = await waitElement('.result-detail-item.round-title', 6000);
  if (!hasRound) {
    const last = checkScatterFound();
    return last.ok ? last : { ok: false, scatterTitle: last.scatterTitle };
  }

  const MAX_ROUNDS = 500;
  let iterations = 0;
  while (iterations++ < MAX_ROUNDS) {
    await waitUntilReady(4000);
    const { total, current } = getRoundInfo();
    const found = checkScatterFound();
    if (found.ok) return found;
    if (current >= total) return { ok: false, scatterTitle: found.scatterTitle };
    if (!clickNextRound()) return { ok: false, scatterTitle: found.scatterTitle };
    const changed = await waitForRoundChange(current, 6000);
    if (!changed) {
      const again = checkScatterFound();
      return again.ok ? again : { ok: false, scatterTitle: again.scatterTitle };
    }
    await sleep(50);
  }
  return { ok: false, scatterTitle: 'Error: terlalu banyak round' };
};
