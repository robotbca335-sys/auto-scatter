# Extension Bridge (ganti 3 script chrome-extension)

## Yang Anda lihat di view-source

```html
<script src="chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/content/location/location.js">
<script src="chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/libs/extend-native-history-api.js">
<script src="chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon/libs/requests.js">
<body data-theme="crimson" class="bg-slate-950 text-white">
  <div id="app"></div>
```

Itu dari **ekstensi browser** (VPN/adblock) yang terpasang di Chrome Anda — **bukan** file di server Bandar80.

URL `chrome-extension://...` **tidak bisa** dimuat dari website atau Puppeteer (keamanan Chrome).

## Apa yang kita implementasikan

Di `server/lib/inject/shims/` ada **3 shim setara** yang di-inject **sebelum** halaman load:

| Ekstensi asli | Shim kita | Fungsi |
|---------------|-----------|--------|
| `location.js` | `location-shim.js` | Pantau URL, hash, assign/replace |
| `extend-native-history-api.js` | `history-shim.js` | Hook `pushState` / `replaceState` untuk SPA `#app` |
| `requests.js` | `requests-shim.js` | Intercept `fetch` + XHR, inject header JWT, tangkap token, blok popup |

Semua tab Puppeteer otomatis memakai **Extension Bridge** via `injectExtensionBridge()`.

## Halaman SPA dark (`#app`)

Untuk target seperti BonusSMB (body dark + `#app`):

- Shim history menunggu `#app` punya konten
- `waitForSpaApp()` di engine sebelum approve/reject
- Class `dark`, `bg-slate-950` ditambahkan ke body (mirip tampilan scraping lama)

## Bandar80 transaction-record

Tetap pakai API `game-oc` + header sync. Shim tambahan menangkap token dari XHR/fetch tanpa popup.
