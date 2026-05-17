# Target Bandar80 (idrbo2.com)

## Halaman cek mutasi / scatter (admin)

- **UI:** `https://bandar80.idrbo2.com/transaction-record.html`
- **JS:** `Content/js/interactJs/transaction-record.js`

## API transaksi (sumber data asli)

| Item | Nilai |
|------|--------|
| Base | `https://bandar80.idrbo2.com/game-oc/` |
| Endpoint | `ida/transaction/history/queryTransactionHistoryListForUser` |
| Method | `GET` |
| Auth header | `X-Access-Token` (JWT di localStorage panel) |

Parameter query (sama seperti form di web):

- `userId`, `transactionId` (format `TX-TX-106-0`), `startDate`, `endDate`, `pageNo`, `pageSize`, `gameCategory`, `gameType`, `gameId`

Response: `data.result.records[]` — status `03` = Pertaruhan (bet), field `debet`, `gameName`, `keteranganId`.

## Bukan bagian dari target

Script `chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/...` **bukan** kode Bandar80. Itu injeksi ekstensi browser (biasanya ad blocker) saat Anda buka view-source. Aplikasi kita **tidak memakai** itu.

Web scraping lama dengan `#app` + tema dark adalah **aplikasi lain** (BonusSMB / dashboard React), bukan `transaction-record.html`.

## Cara app kita bekerja

1. **Cepat:** panggil API `game-oc` + header `X-Access-Token` & `X-Agent-*`
2. **Fallback:** Puppeteer buka `transaction-record.html` + isi `localStorage` token (seperti login panel)
3. **Scatter:** buka history game (`public.*.com/history/{gameName}.html`) headless

Ganti header harian → tab Admin → **Simpan header & sync semua user**.
