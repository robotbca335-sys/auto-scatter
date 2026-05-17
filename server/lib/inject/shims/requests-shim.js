export const REQUESTS_SHIM_FN = (injectHeaders, blockPopups) => {
  if (window.__requestsShimInstalled) return;
  window.__requestsShimInstalled = true;

  const headers = injectHeaders || {};
  window.__capturedUrls = window.__capturedUrls || [];
  window.__networkLog = window.__networkLog || [];
  window.__tokenFound = window.__tokenFound || '';
  window.__lastPopupUrl = '';

  const tokenPat = /[?&]t=([A-Za-z0-9_.~-]{10,})/i;

  const pushUrl = (url, via) => {
    if (!url) return;
    const u = String(url);
    if (!window.__capturedUrls.includes(u)) window.__capturedUrls.push(u);
    window.__networkLog.push({ url: u, via, at: Date.now() });
    const m = u.match(tokenPat);
    if (m && m[1].length >= 10) window.__tokenFound = m[1];
  };

  const applyHeaders = (xhr) => {
    Object.keys(headers).forEach(k => {
      if (headers[k]) {
        try { xhr.setRequestHeader(k, headers[k]); } catch (_) {}
      }
    });
  };

  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    init.headers = init.headers || {};
    const h = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
    Object.keys(headers).forEach(k => { if (headers[k]) h.set(k, headers[k]); });
    init.headers = h;
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    pushUrl(url, 'fetch');
    return _fetch.call(this, input, init).then(res => {
      try {
        const cl = res.clone();
        cl.text().then(t => {
          const m = t.match(tokenPat);
          if (m) window.__tokenFound = m[1];
        }).catch(() => {});
      } catch (_) {}
      return res;
    });
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__scraperUrl = url;
    pushUrl(String(url || ''), 'xhr-open');
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this.__scraperHdrs = this.__scraperHdrs || {};
    this.__scraperHdrs[name] = value;
    return _setHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const xhr = this;
    Object.keys(headers).forEach(k => {
      if (headers[k] && !(xhr.__scraperHdrs && xhr.__scraperHdrs[k])) {
        try { _setHeader.call(xhr, k, headers[k]); } catch (_) {}
      }
    });
    xhr.addEventListener('load', function () {
      try {
        const m = String(xhr.responseText || '').match(tokenPat);
        if (m) window.__tokenFound = m[1];
      } catch (_) {}
    });
    return _send.apply(this, arguments);
  };

  if (blockPopups !== false) {
    window.open = function (url, target, features) {
      pushUrl(String(url || ''), 'window.open');
      window.__lastPopupUrl = String(url || '');
      return null;
    };
  }

  window.__getCapturedUrls = () => window.__capturedUrls.slice();
  window.__getNetworkLog = () => window.__networkLog.slice();
};
