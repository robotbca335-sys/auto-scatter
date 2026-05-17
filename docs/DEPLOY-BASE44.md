# Deploy ke Base44 + Railway (hybrid)

[Base44](https://app.base44.com/) cocok untuk **frontend**. Backend scraping (Puppeteer) harus di **Railway**.

Dokumentasi Base44: [deploy](https://docs.base44.com/developers/references/cli/commands/deploy) · [backend functions](https://docs.base44.com/developers/backend/resources/backend-functions/overview) (Deno — **bukan** Puppeteer).

## Arsitektur

```
[User] → app.base44.com (UI) → API Railway (Puppeteer + header admin)
```

## A. Deploy backend dulu (Railway)

Ikuti `DEPLOY-RAILWAY.md` sampai dapat URL, misalnya:

`https://auto-scatter.up.railway.app`

## B. Base44 — opsi 1: Embed (paling cepat)

1. Login https://app.base44.com/
2. Buat app baru
3. Tambah halaman **Custom HTML / iframe**
4. Isi:

```html
<iframe
  src="https://auto-scatter.up.railway.app"
  style="width:100%;height:100vh;border:0;border-radius:12px;"
  allow="clipboard-read; clipboard-write"
></iframe>
```

Selesai — semua fitur jalan di Railway, Base44 hanya “shell”.

## B. Base44 — opsi 2: CLI + static UI

1. Install CLI (Node 20.19+): `npm install -g base44@latest`
2. Di folder proyek Base44 Anda, `config.jsonc`:

```jsonc
{
  "site": {
    "outputDirectory": "public"
  }
}
```

3. Salin isi `web-app/public/` ke folder output Base44
4. Di `public/index.html` sebelum `app.js`, tambahkan:

```html
<script>window.API_BASE = 'https://auto-scatter.up.railway.app';</script>
```

5. Deploy:

```bash
base44 login
base44 deploy -y
```

UI di Base44 memanggil API Railway (CORS sudah diaktifkan di server).

## C. Prompt AI di Base44

Gunakan file `BASE44-AI-PROMPT.md` — copy ke chat builder Base44.

## Yang tidak bisa di Base44 saja

- Puppeteer / headless Chrome
- Auto approve BonusSMB (butuh browser)
- Intercept token tanpa backend Node

Semua itu **wajib** Railway (atau VPS Docker).
