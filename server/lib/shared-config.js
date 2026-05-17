import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const SHARED_FILE = path.join(DATA_DIR, 'shared-by-target.json');

export function normalizeTarget(adminUrl) {
  if (!adminUrl || !String(adminUrl).trim()) return '';
  try {
    const u = new URL(String(adminUrl).trim());
    return u.origin.toLowerCase();
  } catch {
    return String(adminUrl).trim().replace(/\/$/, '').toLowerCase();
  }
}

async function readStore() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(SHARED_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SHARED_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function getSharedForTarget(adminUrl) {
  const key = normalizeTarget(adminUrl);
  if (!key) return null;
  const store = await readStore();
  return store[key] || null;
}

export async function saveSharedHeaders(adminUrl, payload) {
  const key = normalizeTarget(adminUrl);
  if (!key) throw new Error('URL admin tidak valid');

  const store = await readStore();
  const prev = store[key] || {};
  const next = {
    adminUrl: String(adminUrl).trim().replace(/\/$/, ''),
    adminHeadersRaw: String(payload.adminHeadersRaw || '').trim(),
    adminApiPath: String(payload.adminApiPath || prev.adminApiPath || '').trim(),
    updatedAt: Date.now(),
    updatedBy: String(payload.updatedBy || 'Unknown').trim() || 'Unknown',
    version: (prev.version || 0) + 1
  };

  store[key] = next;
  await writeStore(store);
  return { ...next, target: key };
}

export function maskHeadersPreview(raw) {
  if (!raw) return '';
  return String(raw)
    .split(/\r?\n/)
    .map(line => {
      const m = line.match(/^(X-Access-Token)\s+(.+)$/i);
      if (m && m[2].length > 16) return `${m[1]} ${m[2].slice(0, 10)}…${m[2].slice(-6)}`;
      return line;
    })
    .join('\n');
}

export async function mergeWithShared(settings) {
  const target = normalizeTarget(settings?.adminUrl);
  if (!target) return { ...settings, headersSync: null };

  const shared = await getSharedForTarget(settings.adminUrl);
  if (!shared) {
    return {
      ...settings,
      headersSync: { target, version: 0, updatedAt: null, updatedBy: null }
    };
  }

  return {
    ...settings,
    adminHeadersRaw: shared.adminHeadersRaw || settings.adminHeadersRaw || '',
    adminApiPath: shared.adminApiPath || settings.adminApiPath || '',
    headersSync: {
      target,
      version: shared.version,
      updatedAt: shared.updatedAt,
      updatedBy: shared.updatedBy
    }
  };
}
