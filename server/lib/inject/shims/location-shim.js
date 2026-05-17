export const LOCATION_SHIM_FN = () => {
  if (window.__locationShimInstalled) return;
  window.__locationShimInstalled = true;
  window.__scraperBridge = window.__scraperBridge || { id: 'eppio-shim-v1', version: '2.0.47' };

  const emit = (type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent('__scraperLocation', { detail: { type, ...detail } }));
    } catch (_) {}
  };

  emit('init', { href: location.href, origin: location.origin });

  window.addEventListener('hashchange', () => emit('hashchange', { href: location.href }));
  window.addEventListener('popstate', () => emit('popstate', { href: location.href }));

  try {
    document.documentElement.setAttribute('data-scraper-bridge', 'active');
    if (document.body) {
      document.body.setAttribute('data-theme-bridge', 'crimson');
      document.body.classList.add('bg-slate-950', 'text-white');
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.setAttribute('data-theme-bridge', 'crimson');
        document.body.classList.add('bg-slate-950', 'text-white');
      });
    }
  } catch (_) {}

  const wrapLocationMethod = (key) => {
    const orig = location[key];
    if (typeof orig !== 'function') return;
    location[key] = function (...args) {
      const r = orig.apply(location, args);
      emit('assign', { method: key, href: location.href });
      return r;
    };
  };
  try { wrapLocationMethod('assign'); } catch (_) {}
  try { wrapLocationMethod('replace'); } catch (_) {}
};
