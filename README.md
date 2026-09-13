# Dashboard Realisasi Kinerja — Web 1 Publik

Arsitektur V9: **frontend Dashboard publik + Cloudflare Pages Functions backend dalam satu repository**.

## Prinsip keamanan
- Tidak ada `workbook.json` atau workbook Excel di `public/`.
- Credential Google hanya di Cloudflare Secrets dan hanya dibaca dari Functions melalui `context.env`.
- Browser publik hanya menerima KPI/ringkasan yang memang dipublikasikan.
- Web 1 tidak memiliki editor, import, delete, reset, atau akses database penuh.
- Data publik dibaca dari Google Sheets melalui backend dengan cache singkat agar cepat.

## Struktur

```text
/
├── functions/
│   ├── api/
│   │   ├── health.js
│   │   └── public/
│   │       ├── dashboard.js
│   │       └── revision.js
│   └── lib/
│       └── google.js
├── public/
├── src/
├── index.html
├── package.json
└── README.md
```

## Cloudflare Pages
- Framework preset: `React (Vite)`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: kosong

Karena Functions berada di root repository, jangan upload source sebagai subfolder tambahan.

## Secrets / Variables
Buat di Cloudflare project Web 1:

### Secret
`GOOGLE_SERVICE_ACCOUNT_JSON`

Isi dengan seluruh JSON Service Account Google Cloud. **Jangan commit ke GitHub.**

### Variable
`GOOGLE_SHEETS_SPREADSHEET_ID`

Isi dengan ID spreadsheet database pusat.

## Google Sheets
Share spreadsheet pusat kepada `client_email` dari Service Account dengan minimal akses baca. Backend memakai scope `spreadsheets.readonly` sehingga Web 1 tidak memiliki kemampuan menulis.

## Endpoint
- `GET /api/health`
- `GET /api/public/dashboard?year=2026`
- `GET /api/public/revision`

## Sinkronisasi
Dashboard mengambil data saat dibuka lalu melakukan refresh sekitar setiap 3 detik. Cache respons backend dibatasi pendek sehingga tetap ringan.

## V11 production hardening
Dashboard publik menggunakan rentang Google Sheets yang lebih kecil, token cache, retry/timeout, edge snapshot, ETag/304, dan single-flight per tahun untuk menahan lonjakan viewer.

Sebelum deploy, jalankan:
`node scripts/check-backend.mjs`
