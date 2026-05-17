import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_SCATTER_RULES } from './parser.js';
import { mergeWithShared, saveSharedHeaders, normalizeTarget } from './shared-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const defaults = {
  adminUrl: 'https://bandar80.idrbo2.com',
  adminApiBase: 'https://bandar80.idrbo2.com/game-oc/',
  adminApiPath: 'ida/transaction/history/queryTransactionHistoryListForUser',
  adminHeadersRaw: '',
  executorName: '',
  token: '',
  historyUrl: '',
  historyHost: 'public.zmcyu9ypy.com',
  apiHost: 'public-api.zmcyu9ypy.com',
  historyGameId: '74',
  startDate: '',
  endDate: '',
  hadiahOverride: '',
  autoBonus: false,
  bonusUrl: 'https://bonussmb.com/tickets',
  bonusCookies: '',
  scatterRules: DEFAULT_SCATTER_RULES,
  uiTheme: 'obsidian'
};

async function readLocalSettings() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

async function writeLocalSettings(merged) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const { headersSync, ...toSave } = merged;
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf8');
}

export async function loadSettings() {
  const local = await readLocalSettings();
  return mergeWithShared(local);
}

export async function saveSettings(data, opts = {}) {
  const current = await readLocalSettings();
  const merged = { ...current, ...data };

  if (data.bonusCookies !== undefined && !String(data.bonusCookies || '').trim()) {
    merged.bonusCookies = current.bonusCookies || '';
  }

  let sharedPayload = null;
  const target = normalizeTarget(merged.adminUrl);
  const hdr = data.adminHeadersRaw !== undefined ? String(data.adminHeadersRaw || '').trim() : '';
  const syncHeaders = opts.syncHeaders === true || (hdr && data.adminHeadersRaw !== undefined);

  if (target && syncHeaders && hdr) {
    sharedPayload = await saveSharedHeaders(merged.adminUrl, {
      adminHeadersRaw: hdr,
      adminApiPath: merged.adminApiPath,
      updatedBy: merged.executorName || data.updatedBy || 'Unknown'
    });
    merged.adminHeadersRaw = sharedPayload.adminHeadersRaw;
    merged.adminApiPath = sharedPayload.adminApiPath;
  } else if (target && data.adminApiPath !== undefined && !hdr) {
    const existing = await mergeWithShared(merged);
    if (existing.adminHeadersRaw) {
      sharedPayload = await saveSharedHeaders(merged.adminUrl, {
        adminHeadersRaw: existing.adminHeadersRaw,
        adminApiPath: merged.adminApiPath,
        updatedBy: merged.executorName || 'Unknown'
      });
    }
  }

  await writeLocalSettings(merged);
  const withShared = await mergeWithShared(merged);
  return { settings: withShared, sharedPayload };
}
