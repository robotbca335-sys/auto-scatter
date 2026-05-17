export const ADMIN_SEARCH_FN = async (userId, transactionId, startDate, endDate, todayDate) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function waitFor(selector, timeout = 8000) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      let resolved = false;
      const finish = result => {
        if (resolved) return;
        resolved = true;
        obs.disconnect();
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), timeout);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) finish(found);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  function setInputValue(name, id, val) {
    const inp = document.querySelector(`input[name="${name}"]#${id}`)
      || document.querySelector(`input[name="${name}"]`) || document.querySelector(`#${id}`);
    if (!inp) return false;
    const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    ns.call(inp, val);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function tableHasTicketRow(txId) {
    const txShort = String(txId || '').slice(0, 19);
    for (const link of document.querySelectorAll('.jq-keterangan-link')) {
      const text = (link.textContent || '').replace(/\s/g, '');
      if (text.includes(txShort) || link.dataset.transactionid === txShort) return true;
    }
    return false;
  }

  function isTrueEmptyTable() {
    const links = document.querySelectorAll('.jq-keterangan-link');
    if (links.length > 0) return false;
    const rows = document.querySelectorAll('table tbody tr');
    if (!rows.length) return true;
    for (const tr of rows) {
      if (tr.querySelector('.jq-keterangan-link')) return false;
      const t = (tr.textContent || '').trim();
      if (t && !/no\s*data/i.test(t)) return false;
    }
    return true;
  }

  function waitForTransactionRows(txId, timeout = 25000) {
    return new Promise(resolve => {
      const txShort = txId.slice(0, 19);
      const checkLinks = () => {
        const links = document.querySelectorAll('.jq-keterangan-link');
        if (!links.length) return null;
        for (const link of links) {
          const text = link.textContent || '';
          if (text.includes(txShort) || link.dataset.transactionid === txShort) return links;
        }
        return null;
      };
      const immediate = checkLinks();
      if (immediate) { resolve(immediate); return; }
      let resolved = false;
      const finish = result => {
        if (resolved) return;
        resolved = true;
        obs.disconnect();
        clearTimeout(timer);
        clearInterval(poll);
        resolve(result);
      };
      const timer = setTimeout(() => {
        const fallback = document.querySelectorAll('.jq-keterangan-link');
        finish(fallback.length > 0 ? fallback : null);
      }, timeout);
      const obs = new MutationObserver(() => {
        const r = checkLinks();
        if (r) finish(r);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const poll = setInterval(() => {
        const r = checkLinks();
        if (r) finish(r);
      }, 120);
    });
  }

  try {
    if (startDate && startDate !== todayDate) setInputValue('startDate', 'startDate', startDate);
    if (endDate && endDate !== todayDate) setInputValue('endDate', 'endDate', endDate);

    const userInput = await waitFor('[name="userId"]', 12000);
    const txInput = await waitFor('[name="transactionId"]', 12000);
    const searchBtn = document.querySelector('.transaction-record-search .jq-after-search')
      || document.querySelector('.success-button.langWord.jq-after-search')
      || document.querySelector('button.success-button') || document.querySelector('[type="submit"]');

    if (!userInput || !txInput || !searchBtn) throw new Error('Elemen form tidak ditemukan.');

    const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    ns.call(userInput, userId);
    userInput.dispatchEvent(new Event('input', { bubbles: true }));
    userInput.dispatchEvent(new Event('change', { bubbles: true }));
    ns.call(txInput, `${transactionId}-${transactionId}-106-0`);
    txInput.dispatchEvent(new Event('input', { bubbles: true }));
    txInput.dispatchEvent(new Event('change', { bubbles: true }));

    searchBtn.click();
    await sleep(180);
    searchBtn.click();
    await sleep(400);

    let links = await waitForTransactionRows(transactionId, 25000);
    if (!links || !links.length) {
      searchBtn.click();
      links = await waitForTransactionRows(transactionId, 45000);
      if (!links || !links.length) {
        if (!tableHasTicketRow(transactionId) && isTrueEmptyTable()) {
          return { ok: false, scatterTitle: 'NO_DATA', debetValue: 'N/A', gameName: '' };
        }
        throw new Error('Transaksi tidak ditemukan di halaman admin.');
      }
    }

    let debetValue = '0';
    let gameName = null;
    const txShort = transactionId.slice(0, 19);

    for (const link of links) {
      const linkText = link.textContent || '';
      if (!linkText.includes(txShort) && link.dataset.transactionid !== txShort) continue;
      const row = link.closest('tr');
      if (!row) continue;
      const statusEl = row.querySelector("[data-changekey='status']");
      const status = statusEl ? statusEl.textContent.trim().toLowerCase() : '';
      if (status === 'pertaruhan' || status.includes('bet') || status.includes('debit')) {
        const debetEl = row.querySelector("[data-changekey='debet']");
        debetValue = debetEl ? debetEl.textContent.trim() : '0';
        gameName = link.dataset.gamename || link.dataset.gameId || link.getAttribute('data-gamename') || '';
        break;
      }
    }

    if (!gameName) {
      for (const link of links) {
        if ((link.textContent || '').includes(txShort)) {
          gameName = link.dataset.gamename || '';
          if (gameName) break;
        }
      }
    }

    if (!gameName) throw new Error('Game Name tidak ditemukan.');

    const captured = (window.__capturedUrls || []).slice();
    const tokenFound = window.__tokenFound || '';
    return { ok: true, debetValue, gameName, captured, tokenFound };
  } catch (e) {
    return { ok: false, scatterTitle: e.message, debetValue: 'N/A', gameName: '' };
  }
};
