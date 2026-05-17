# AUTO SCATTER Web v4

## Ringkas

| Platform | Cocok untuk |
|----------|-------------|
| **Railway** | Semua fitur (Puppeteer, header admin, BonusSMB) |
| **Base44** | Hanya UI — backend tetap Railway |

## Header admin — sync semua operator

Header disimpan **per URL target** (origin admin). Jika satu operator ganti header, **semua tab/browser** yang terhubung ke server yang sama otomatis update via SSE.

Tab **Admin** → tempel header → **Simpan header & sync semua user**

Atau tempel (satu baris per header):

```
X-Access-Token eyJ...
X-Agent-Pkid 180005
X-Agent-Role KAPTENKASIR
X-Agent-Suid BADAR
X-Agent-User BANDAR80MARWAN626
X-Agent-UserId 1978665551754477569
```

Server akan:
1. Coba **REST API** admin dengan header tersebut (cepat)
2. Jika gagal → **Puppeteer** dengan header yang sama (tanpa popup login)

## Dokumentasi deploy

- [DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md) — **mulai di sini**
- [DEPLOY-BASE44.md](docs/DEPLOY-BASE44.md) — hybrid Base44 + Railway
- [BASE44-AI-PROMPT.md](docs/BASE44-AI-PROMPT.md) — prompt untuk AI Base44

## Lokal

```bash
npm install
npm start
```

Copy `.env.example` → `.env` untuk token di environment.
