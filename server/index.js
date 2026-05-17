import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { engine } from './lib/engine.js';
import { loadSettings, saveSettings } from './lib/store.js';
import { shutdownBrowser } from './lib/browser.js';
import { normalizeTarget, getSharedForTarget, saveSharedHeaders } from './lib/shared-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3847);
const app = express();

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (/localhost|127\.0\.0\.1|base44\.com|railway\.app/.test(origin)) return cb(null, true);
    cb(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) {}
  }
}

function buildConfigSyncPayload(settings, sharedPayload) {
  const target = normalizeTarget(settings.adminUrl);
  return {
    target,
    adminUrl: settings.adminUrl,
    adminHeadersRaw: settings.adminHeadersRaw || '',
    adminApiPath: settings.adminApiPath || '',
    headersSync: settings.headersSync || null,
    version: sharedPayload?.version ?? settings.headersSync?.version ?? 0,
    updatedAt: sharedPayload?.updatedAt ?? settings.headersSync?.updatedAt,
    updatedBy: sharedPayload?.updatedBy ?? settings.headersSync?.updatedBy
  };
}

async function applyAndBroadcastSettings(body, opts = {}) {
  const { settings, sharedPayload } = await saveSettings(body || {}, opts);
  engine.updateSettings(settings);
  const sync = buildConfigSyncPayload(settings, sharedPayload);
  if (sync.target && (sharedPayload || opts.syncHeaders)) {
    broadcast('configSync', sync);
  }
  return { settings, sync };
}

['status', 'row', 'batchStart', 'batchDone', 'cleared'].forEach(ev => {
  engine.on(ev, data => broadcast(ev, data));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, running: engine.running, version: '4.0.0' });
});

app.get('/api/state', (_req, res) => {
  res.json(engine.getState());
});

app.get('/api/settings', async (_req, res) => {
  const s = await loadSettings();
  engine.updateSettings(s);
  res.json(engine.sanitizeSettings(s));
});

app.get('/api/headers/shared', async (req, res) => {
  const adminUrl = String(req.query.adminUrl || '').trim();
  if (!adminUrl) {
    return res.status(400).json({ ok: false, error: 'adminUrl wajib' });
  }
  const shared = await getSharedForTarget(adminUrl);
  const target = normalizeTarget(adminUrl);
  res.json({
    ok: true,
    target,
    adminHeadersRaw: shared?.adminHeadersRaw || '',
    adminApiPath: shared?.adminApiPath || '',
    headersSync: shared
      ? { target, version: shared.version, updatedAt: shared.updatedAt, updatedBy: shared.updatedBy }
      : { target, version: 0, updatedAt: null, updatedBy: null }
  });
});

app.post('/api/headers/sync', async (req, res) => {
  try {
    const { adminUrl, adminHeadersRaw, adminApiPath, executorName } = req.body || {};
    if (!adminUrl?.trim()) {
      return res.status(400).json({ ok: false, error: 'URL admin wajib' });
    }
    if (!String(adminHeadersRaw || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Header API wajib diisi' });
    }
    const { settings, sync } = await applyAndBroadcastSettings({
      adminUrl: adminUrl.trim(),
      adminHeadersRaw: String(adminHeadersRaw).trim(),
      adminApiPath: adminApiPath || '',
      executorName: executorName || ''
    }, { syncHeaders: true });
    res.json({ ok: true, settings: engine.sanitizeSettings(settings), sync });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const syncHeaders = !!String(req.body?.adminHeadersRaw || '').trim();
    const { settings, sync } = await applyAndBroadcastSettings(req.body || {}, { syncHeaders });
    res.json({ ok: true, settings: engine.sanitizeSettings(settings), sync: syncHeaders ? sync : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const settings = await loadSettings();
  engine.updateSettings(settings);
  res.write(`event: connected\ndata: ${JSON.stringify({
    ...engine.getState(),
    headersSync: settings.headersSync,
    adminUrl: settings.adminUrl
  })}\n\n`);
  if (settings.headersSync?.target) {
    res.write(`event: configSync\ndata: ${JSON.stringify(buildConfigSyncPayload(settings))}\n\n`);
  }
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.post('/api/process', async (req, res) => {
  if (engine.running) {
    return res.status(409).json({ ok: false, error: 'Proses sudah berjalan' });
  }
  const { mutation, hadiahOverride } = req.body || {};
  if (!mutation?.trim()) {
    return res.status(400).json({ ok: false, error: 'Data mutasi wajib diisi' });
  }
  const settings = await loadSettings();
  engine.updateSettings(settings);
  if (!settings.adminUrl?.trim() || !settings.executorName?.trim()) {
    return res.status(400).json({ ok: false, error: 'URL Admin dan Nama Eksekutor wajib diisi' });
  }
  res.json({ ok: true, message: 'Proses dimulai' });
  engine.start(mutation, { hadiahOverride }).catch(e => {
    engine.running = false;
    broadcast('status', { message: 'Error: ' + e.message, at: Date.now() });
  });
});

app.post('/api/clear', (_req, res) => {
  engine.clear();
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`AUTO SCATTER WEB → http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  server.close();
  await shutdownBrowser();
  process.exit(0);
});

loadSettings().then(s => engine.updateSettings(s)).catch(() => {});
