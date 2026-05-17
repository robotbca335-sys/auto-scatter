import { EventEmitter } from 'events';
import {
  parseMutationData,
  buildCheckLink,
  buildRejectReason,
  shouldApproveFromResult,
  extractToken,
  extractRuntimeConfigFromHistoryUrl
} from './parser.js';
import { finalizeRow } from './finalize.js';
import { newPage, closePage, applyCookies, parseCookieJson } from './browser.js';
import { waitForSpaApp, readBridgeCapture } from './inject/extension-bridge.js';
import { saveSettings } from './store.js';
import { mergeAdminHeaders, fetchAdminTransaction } from './admin-headers.js';
import { isBandar80Target, bandar80Origin, BANDAR80_ADMIN_PAGE } from './bandar80-api.js';
import { ADMIN_SEARCH_FN } from './inject/admin-search.js';
import { DETAIL_CHECK_FN } from './inject/detail-check.js';
import { BONUS_ACTION_FN } from './inject/bonus-action.js';

const PARALLEL = Number(process.env.PARALLEL_LIMIT || 12);
const PROCESS_TIMEOUT = Number(process.env.PROCESS_TIMEOUT_MS || 120000);

export class ScatterEngine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.results = [];
    this.stats = { totalInput: 0, processed: 0, timeout: 0, invalid: 0 };
    this.settings = {};
    this.token = '';
    this.tokenAnchor = null;
    this._adminPage = null;
  }

  getState() {
    return {
      running: this.running,
      results: this.results,
      stats: this.stats,
      settings: this.sanitizeSettings(this.settings),
      tokenPreview: this.token ? `${this.token.slice(0, 8)}…` : ''
    };
  }

  sanitizeSettings(s) {
    const { bonusCookies, ...rest } = s || {};
    const headers = mergeAdminHeaders(s || {});
    return {
      ...rest,
      adminHeadersRaw: s?.adminHeadersRaw || '',
      hasBonusCookies: !!(bonusCookies && String(bonusCookies).trim()),
      hasAdminHeaders: !!headers['X-Access-Token'],
      headersPreview: headers['X-Access-Token']
        ? `${headers['X-Access-Token'].slice(0, 12)}…`
        : ''
    };
  }

  getAdminHeaders() {
    return mergeAdminHeaders(this.settings);
  }

  updateSettings(next) {
    const headersChanged = next.adminHeadersRaw !== undefined
      && next.adminHeadersRaw !== this.settings.adminHeadersRaw;
    this.settings = { ...this.settings, ...next };
    if (headersChanged) this.resetAdminPage();
    if (next.token) this.token = next.token;
    const cfg = extractRuntimeConfigFromHistoryUrl(next.historyUrl || '');
    if (cfg?.token) this.token = cfg.token;
    if (cfg?.historyHost) this.settings.historyHost = cfg.historyHost;
    if (cfg?.apiHost) this.settings.apiHost = cfg.apiHost;
    if (cfg?.historyGameId) this.settings.historyGameId = cfg.historyGameId;
  }

  async resetAdminPage() {
    try {
      if (this._adminPage && !this._adminPage.isClosed()) await closePage(this._adminPage);
    } catch (_) {}
    this._adminPage = null;
  }

  emitStatus(msg) {
    this.emit('status', { message: msg, at: Date.now() });
  }

  emitRow(row) {
    this.emit('row', row);
  }

  async start(rawMutation, options = {}) {
    if (this.running) throw new Error('Proses sudah berjalan');
    this.running = true;
    this.results = [];
    const todayDate = new Date().toISOString().slice(0, 10);
    const rules = this.settings.scatterRules;
    const parseSummary = parseMutationData(rawMutation, options.hadiahOverride || '', rules);
    const items = parseSummary.parsed.map(item => ({
      ...item,
      checkLink: buildCheckLink(
        item.transactionId,
        this.token,
        this.settings.historyHost,
        this.settings.apiHost,
        this.settings.historyGameId
      ),
      executorName: this.settings.executorName,
      urlAdmin: this.settings.adminUrl,
      startDate: this.settings.startDate || todayDate,
      endDate: this.settings.endDate || todayDate,
      todayDate
    }));

    this.stats = {
      totalInput: items.length,
      processed: 0,
      timeout: 0,
      invalid: items.filter(i => !i.processable).length
    };

    this.emit('batchStart', { total: items.length, unreadable: parseSummary.unreadableNotes });
    this.emitStatus(`Memproses ${items.length} mutasi…`);

    const queue = [...items];
    let active = 0;

    await new Promise((resolve) => {
      const pump = () => {
        while (active < PARALLEL && queue.length > 0) {
          const item = queue.shift();
          active++;
          this.processItem(item)
            .catch(e => this.finishItem(item, { scatterTitle: 'Error: ' + e.message, debetValue: 'N/A' }))
            .finally(() => {
              active--;
              if (queue.length === 0 && active === 0) resolve();
              else pump();
            });
        }
        if (queue.length === 0 && active === 0) resolve();
      };
      pump();
    });

    this.running = false;
    this.emitStatus('Selesai.');
    this.emit('batchDone', { stats: this.stats, results: this.results });
    try { await closePage(this._adminPage); this._adminPage = null; } catch (_) {}
  }

  async getAdminPage() {
    if (this._adminPage && !this._adminPage.isClosed()) return this._adminPage;
    const hdr = this.getAdminHeaders();
    const injectAuth = isBandar80Target(this.settings.adminUrl);
    const page = await newPage(hdr, { injectBandar80Auth: injectAuth });
    const origin = injectAuth
      ? bandar80Origin(this.settings)
      : String(this.settings.adminUrl || '').replace(/\/$/, '');
    const pagePath = injectAuth ? BANDAR80_ADMIN_PAGE : '/transaction-record.html';
    await page.goto(`${origin.replace(/\/$/, '')}${pagePath}`, { waitUntil: 'domcontentloaded' });
    this._adminPage = page;
    return page;
  }

  async processItem(item) {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('Timeout proses')), PROCESS_TIMEOUT)
    );
    await Promise.race([this._processItemCore(item), timeout]);
  }

  async _processItemCore(item) {
    const { userId, transactionId } = item;
    this.emitStatus(`Cek: ${transactionId.slice(0, 16)}…`);

    if (!item.processable) {
      return this.finishItem(item, { scatterTitle: 'Data tidak lengkap', debetValue: 'N/A' });
    }

    let searchResult = await fetchAdminTransaction(
      this.settings, userId, transactionId, item.startDate, item.endDate
    );

    if (searchResult) {
      if (searchResult.ok === false) {
        return this.finishItem(item, {
          debetValue: searchResult.debetValue || 'N/A',
          scatterTitle: searchResult.scatterTitle || 'Gagal API admin'
        });
      }
      searchResult = {
        ok: true,
        debetValue: searchResult.debetValue,
        gameName: searchResult.gameName,
        captured: searchResult.captured || [],
        tokenFound: searchResult.tokenFound || ''
      };
    } else {
      const adminPage = await this.getAdminPage();
      searchResult = await adminPage.evaluate(
        ADMIN_SEARCH_FN,
        userId,
        transactionId,
        item.startDate,
        item.endDate,
        item.todayDate
      );
      const capAdmin = await readBridgeCapture(adminPage);
      if (capAdmin.token?.length >= 10) searchResult.tokenFound = capAdmin.token;
      if (capAdmin.urls?.length) searchResult.captured = capAdmin.urls;
    }

    if (searchResult.tokenFound?.length >= 10) this.token = searchResult.tokenFound;
    for (const u of searchResult.captured || []) {
      const tk = extractToken(u);
      if (tk.length >= 10) { this.token = tk; break; }
    }
    if (this.token) {
      this.settings.token = this.token;
      saveSettings({ token: this.token }).catch(() => {});
    }

    if (!searchResult.ok) {
      return this.finishItem(item, {
        debetValue: searchResult.debetValue || 'N/A',
        scatterTitle: searchResult.scatterTitle || 'Gagal admin'
      });
    }

    const hHost = this.settings.historyHost || 'public.zmcyu9ypy.com';
    const aHost = this.settings.apiHost || `public-api.${hHost.replace(/^public\./, '')}`;
    const txShort = transactionId.slice(0, 19);
    const encApi = encodeURIComponent(`${aHost}/web-api/operator-proxy/v1/History/GetBetHistory`);
    const detailUrl = `https://${hHost}/history/${searchResult.gameName}.html?psid=${txShort}&sid=${txShort}&api=${encApi}&lang=en&t=${this.token || ''}`;

    const detailPage = await newPage(this.getAdminHeaders(), { markDom: false });
    try {
      // Tunggu sampai network idle agar halaman SPA selesai render sebelum evaluate
      try {
        await detailPage.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (navErr) {
        // networkidle2 bisa timeout pada SPA panjang — cukup tunggu domcontentloaded
        await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
      }

      // Beri waktu tambahan agar JS SPA selesai render sebelum evaluate
      await new Promise(r => setTimeout(r, 1500));

      // Cek apakah halaman sudah navigate ulang (redirect ke login/error)
      const finalUrl = detailPage.url();
      if (!finalUrl.includes(hHost) && !finalUrl.includes('history')) {
        return await this.finishItem(item, {
          debetValue: searchResult.debetValue,
          scatterTitle: 'Halaman redirect — token mungkin expired',
          checkLink: detailUrl
        });
      }

      const cap = await readBridgeCapture(detailPage);
      if (cap.token?.length >= 10) this.token = cap.token;

      // Evaluate dengan proteksi navigation error
      let detail = { ok: false, scatterTitle: 'Gagal evaluate halaman' };
      try {
        detail = await detailPage.evaluate(DETAIL_CHECK_FN);
      } catch (evalErr) {
        const msg = String(evalErr.message || '');
        if (msg.includes('context was destroyed') || msg.includes('Navigation')) {
          // Halaman navigate saat evaluate — kemungkinan SPA redirect
          detail = { ok: false, scatterTitle: 'Token expired / halaman redirect saat cek' };
        } else {
          detail = { ok: false, scatterTitle: 'Error: ' + msg.slice(0, 80) };
        }
      }

      await this.finishItem(item, {
        debetValue: searchResult.debetValue,
        scatterTitle: detail.scatterTitle || (detail.ok ? 'Ditemukan' : 'Scatter tidak ditemukan'),
        checkLink: detailUrl
      });
    } finally {
      await closePage(detailPage);
    }
  }

  async finishItem(meta, result) {
    const row = finalizeRow(
      meta,
      result,
      this.settings.executorName,
      this.settings.adminUrl,
      meta.todayDate
    );

    const decision = shouldApproveFromResult(row);
    let bonusAction = null;

    if (this.settings.autoBonus && this.settings.bonusCookies) {
      if (decision === true) {
        bonusAction = await this.runBonusAction(meta.transactionId, 'approve', '');
        row.bonusAction = bonusAction.ok ? 'APPROVE_OK' : `APPROVE_FAIL: ${bonusAction.error}`;
      } else if (decision === false) {
        const reason = buildRejectReason(
          row.betCheckStatus, row.scatterCheckStatus, row.hadiahStatus,
          row.debetValue, row.scatterTitle, row.expectedPrize
        );
        bonusAction = await this.runBonusAction(meta.transactionId, 'reject', reason);
        row.bonusAction = bonusAction.ok ? 'REJECT_OK' : `REJECT_FAIL: ${bonusAction.error}`;
      }
    }

    if (row.overallStatus === 'SESUAI') {
      this.tokenAnchor = { date: meta.todayDate, userId: meta.userId, transactionId: meta.transactionId };
    }

    if (String(row.scatterTitle || '').includes('Timeout')) this.stats.timeout++;
    this.stats.processed++;
    this.results.push(row);
    this.emitRow(row);
    return row;
  }

  async runBonusAction(txId, action, reason) {
    const cookies = parseCookieJson(this.settings.bonusCookies);
    if (!cookies.length) return { ok: false, error: 'Cookie BonusSMB kosong' };

    const url = this.settings.bonusUrl || 'https://bonussmb.com/tickets';
    const page = await newPage({}, { blockPopups: true, markDom: true });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await applyCookies(page, cookies);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForSpaApp(page, 28000);
      await page.waitForSelector('table tbody tr, #app table tbody tr', { timeout: 20000 }).catch(() => {});
      return await page.evaluate(BONUS_ACTION_FN, txId, action, reason);
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await closePage(page);
    }
  }

  
  clear() {
    this.results = [];
    this.stats = { totalInput: 0, processed: 0, timeout: 0, invalid: 0 };
    this.emit('cleared');
  }
}

export const engine = new ScatterEngine();
