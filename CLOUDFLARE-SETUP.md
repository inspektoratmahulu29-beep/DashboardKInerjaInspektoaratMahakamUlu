# Setup Cloudflare Web 1

1. Buat repository GitHub baru untuk Web 1.
2. Upload **isi root paket ini langsung ke root repository**.
3. Cloudflare → Workers & Pages → Create application → Pages → Connect to Git.
4. Pilih repository Web 1.
5. Build command: `npm run build`.
6. Build output directory: `dist`.
7. Root directory: kosong.
8. Setelah deploy, buka Settings → Variables and Secrets.
9. Tambahkan Secret `GOOGLE_SERVICE_ACCOUNT_JSON`.
10. Tambahkan Variable `GOOGLE_SHEETS_SPREADSHEET_ID`.
11. Di Google Sheets, share spreadsheet pusat ke email `client_email` milik Service Account dengan akses Viewer.
12. Buka `/api/health`. `googleSheetsConfigured` harus `true`.
13. Buka `/api/public/dashboard?year=2026`. Harus mengembalikan JSON KPI.
14. Buka halaman Dashboard. Angka KPI harus diambil dari backend, bukan dari file `public/data`.
