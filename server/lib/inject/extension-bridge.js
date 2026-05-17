import { LOCATION_SHIM_FN } from './shims/location-shim.js';
import { HISTORY_SHIM_FN } from './shims/history-shim.js';
import { REQUESTS_SHIM_FN } from './shims/requests-shim.js';

export async function injectExtensionBridge(page, options = {}) {
  const headers = options.headers || {};
  const blockPopups = options.blockPopups !== false;
  const markDom = options.markDom !== false;

  await page.evaluateOnNewDocument(LOCATION_SHIM_FN);
  await page.evaluateOnNewDocument(HISTORY_SHIM_FN);
  await page.evaluateOnNewDocument(REQUESTS_SHIM_FN, headers, blockPopups);

  if (markDom) {
    await page.evaluateOnNewDocument(() => {
      const mark = () => {
        try {
          const html = document.documentElement;
          html.classList.add('dark');
          html.style.colorScheme = 'dark';
          if (document.body) {
            document.body.setAttribute('data-scraper-processed', 'true');
            if (!document.getElementById('__scraperBridgeTag')) {
              const meta = document.createElement('meta');
              meta.id = '__scraperBridgeTag';
              meta.name = 'scraper-bridge';
              meta.content = 'eppio-equivalent-shim';
              document.head.appendChild(meta);
            }
          }
        } catch (_) {}
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mark);
      } else mark();
    });
  }
}

export async function waitForSpaApp(page, timeoutMs = 28000) {
  try {
    await page.waitForFunction(
      () => {
        const app = document.querySelector('#app');
        return app && app.children.length > 0;
      },
      { timeout: timeoutMs }
    );
    return true;
  } catch (_) {
    return false;
  }
}

export async function readBridgeCapture(page) {
  return page.evaluate(() => ({
    urls: window.__getCapturedUrls ? window.__getCapturedUrls() : (window.__capturedUrls || []),
    token: window.__tokenFound || '',
    lastPopup: window.__lastPopupUrl || ''
  }));
}
