# Prompt untuk Base44 AI Builder

Copy teks di bawah ini ke chat AI di https://app.base44.com/

---

Buat aplikasi web **AUTO SCATTER KKS BANDAR 80** dengan tampilan premium dark (glassmorphism, gradien biru-ungu, font Outfit).

## Halaman utama

1. **Tab Cek Scatter**
   - Textarea besar: "Data Mutasi Mentah"
   - Tombol: Mulai Proses, Salin Hasil, Hapus
   - Status bar real-time
   - 4 counter: Total, Selesai, Timeout, Invalid
   - Tabel hasil: User, Tx ID, Bet Mutasi, Bet Admin, Status Bet, Scatter, Status SC, Hadiah, Hasil, Bonus Action

2. **Tab Admin**
   - URL Dasar Admin
   - Textarea Header API (format: `X-Access-Token eyJ...` per baris, plus X-Agent-Pkid, X-Agent-Role, X-Agent-Suid, X-Agent-User, X-Agent-UserId)
   - Token history game, nama eksekutor, tanggal mulai/akhir

3. **Tab BonusSMB**
   - Toggle auto approve/reject
   - URL tickets bonussmb.com
   - Textarea cookie JSON

4. **Tab Aturan**
   - Tabel min/max bet dan hadiah scatter 3/4/5

## Integrasi backend (wajib)

Semua aksi memanggil API eksternal (jangan mock):

```javascript
const API = 'https://GANTI-DENGAN-URL-RAILWAY-ANDA.up.railway.app';

// SSE progress
const es = new EventSource(API + '/api/events');

// Mulai proses
await fetch(API + '/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mutation: textareaValue })
});

// Simpan settings
await fetch(API + '/api/settings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ adminUrl, adminHeadersRaw, executorName, ... })
});
```

Ganti `API` dengan URL Railway setelah deploy backend Docker (lihat DEPLOY-RAILWAY.md).

## Alur bisnis

1. User tempel mutasi (format bandar80 / MAHJONG / x3 / Rp)
2. Backend cek bet + scatter + hadiah vs aturan
3. Jika SESUAI → approve tiket BonusSMB; jika tidak → reject dengan alasan

## Catatan desain

- Mobile-friendly
- Animasi halus (fade, glow)
- Badge "LIVE" saat SSE terhubung

---

## File yang di-upload ke Base44 (opsi static)

Jika tidak pakai AI builder, upload folder ini ke project Base44:

```
web-app/public/
  index.html
  css/app.css
  js/app.js
```

Dan set di `<head>`:

```html
<script>window.API_BASE = 'https://URL-RAILWAY-ANDA';</script>
```

Backend **tidak** di-upload ke Base44 — deploy `web-app/` penuh ke Railway.
