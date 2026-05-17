export const HISTORY_SHIM_FN = () => {
  if (window.__historyShimInstalled) return;
  window.__historyShimInstalled = true;

  const notify = (source, url) => {
    try {
      window.dispatchEvent(new CustomEvent('__scraperHistory', {
        detail: { source, url: url || location.href, ts: Date.now() }
      }));
    } catch (_) {}
  };

  const wrap = (name) => {
    const orig = history[name];
    if (!orig) return;
    history[name] = function (...args) {
      const ret = orig.apply(this, args);
      notify(name, args[2] || args[0] || location.href);
      try { window.dispatchEvent(new PopStateEvent('popstate', { state: args[0] })); } catch (_) {}
      return ret;
    };
  };

  wrap('pushState');
  wrap('replaceState');

  const origBack = history.back;
  const origForward = history.forward;
  const origGo = history.go;
  history.back = function () { const r = origBack.apply(this, arguments); notify('back'); return r; };
  history.forward = function () { const r = origForward.apply(this, arguments); notify('forward'); return r; };
  history.go = function () { const r = origGo.apply(this, arguments); notify('go'); return r; };

  window.__spaReady = new Promise(resolve => {
    const done = () => {
      const app = document.querySelector('#app');
      if (app && app.children.length > 0) {
        resolve(true);
        return true;
      }
      return false;
    };
    if (done()) return;
    const obs = new MutationObserver(() => { if (done()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => resolve(false), 25000);
  });
};
