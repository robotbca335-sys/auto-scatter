import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA = path.join(__dirname, '../../.browser-data');

let browser = null;
let launchPromise = null;

import { injectExtensionBridge } from './inject/extension-bridge.js';

export async function getBrowser() {
  if (browser?.connected) return browser;
  if (launchPromise) return launchPromise;

  launchPromise = puppeteer.launch({
    headless: process.env.HEADLESS !== 'false' ? 'new' : false,
    userDataDir: USER_DATA,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-popup-blocking',
      '--disable-notifications',
      '--window-size=1280,800'
    ],
    defaultViewport: { width: 1280, height: 800 }
  });

  browser = await launchPromise;
  launchPromise = null;
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

export async function injectBandar80Auth(page, extraHeaders) {
  if (!extraHeaders?.['X-Access-Token']) return;
  const auth = {
    token: extraHeaders['X-Access-Token'] || '',
    pkid: extraHeaders['X-Agent-Pkid'] || '',
    role: extraHeaders['X-Agent-Role'] || '',
    suid: extraHeaders['X-Agent-Suid'] || '',
    user: extraHeaders['X-Agent-User'] || '',
    userId: extraHeaders['X-Agent-UserId'] || ''
  };
  await page.evaluateOnNewDocument(a => {
    try {
      if (a.token) localStorage.setItem('X-Access-Token', a.token);
      if (a.pkid) localStorage.setItem('X-Agent-Pkid', a.pkid);
      if (a.role) localStorage.setItem('X-Agent-Role', a.role);
      if (a.suid) localStorage.setItem('X-Agent-Suid', a.suid);
      if (a.user) localStorage.setItem('X-Agent-User', a.user);
      if (a.userId) localStorage.setItem('X-Agent-UserId', a.userId);
    } catch (_) {}
  }, auth);
}

export async function newPage(extraHeaders = null, opts = {}) {
  const b = await getBrowser();
  const page = await b.newPage();
  const hdrs = extraHeaders && Object.keys(extraHeaders).length ? extraHeaders : {};
  if (Object.keys(hdrs).length) {
    await page.setExtraHTTPHeaders(hdrs);
    if (opts.injectBandar80Auth) await injectBandar80Auth(page, hdrs);
  }
  await injectExtensionBridge(page, {
    headers: hdrs,
    blockPopups: opts.blockPopups !== false,
    markDom: opts.markDom !== false
  });
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(30000);
  return page;
}

export async function closePage(page) {
  if (!page?.isClosed?.()) {
    try { await page.close(); } catch (_) {}
  }
}

export async function shutdownBrowser() {
  if (browser) {
    try { await browser.close(); } catch (_) {}
    browser = null;
  }
}

export async function applyCookies(page, cookies) {
  if (!cookies?.length) return;
  const normalized = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    expires: c.expirationDate || c.expires,
    httpOnly: !!c.httpOnly,
    secure: c.secure !== false,
    sameSite: c.sameSite || 'Lax'
  }));
  const host = (normalized[0].domain || '').replace(/^\./, '');
  if (host) {
    await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
  }
  await page.setCookie(...normalized);
}

export function parseCookieJson(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    if (data.cookies && Array.isArray(data.cookies)) return data.cookies;
  } catch (_) {}
  return [];
}
