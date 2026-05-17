# Deploy ke Railway (disarankan — 100% fitur)

Railway menjalankan Docker + Chromium + Puppeteer. Ini cara paling stabil untuk scraping & approve/reject.

## Langkah

1. Buat akun di https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. Pilih repo ini, set **Root Directory** = `web-app`
4. Railway akan memakai `Dockerfile` + `railway.toml`
5. Di **Variables**, tambahkan:

| Variable | Contoh |
|----------|--------|
| `PORT` | `3847` |
| `HEADLESS` | `true` |
| `PARALLEL_LIMIT` | `10` |
| `ADMIN_ACCESS_TOKEN` | `eyJ...` (JWT Anda) |
| `X_AGENT_PKID` | `180005` |
| `X_AGENT_ROLE` | `KAPTENKASIR` |
| `X_AGENT_SUID` | `BADAR` |
| `X_AGENT_USER` | `BANDAR80MARWAN626` |
| `X_AGENT_USER_ID` | `1978665551754477569` |

Atau satu baris:

```
ADMIN_HEADERS_RAW=X-Access-Token eyJ... X-Agent-Pkid 180005 ...
```

6. Deploy → buka URL publik Railway (mis. `https://auto-scatter-production.up.railway.app`)
7. Di tab Admin web, isi **URL Dasar Admin** (domain panel bandar80 Anda)

## Tanpa GitHub (CLI)

```bash
cd web-app
npm i -g @railway/cli
railway login
railway init
railway up
railway variables set ADMIN_ACCESS_TOKEN=eyJ...
railway open
```

## Cek sehat

`GET https://YOUR-APP.up.railway.app/api/health` → `{"ok":true}`
