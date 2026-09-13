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

## V10 — public dashboard high-concurrency

Public dashboard sekarang memakai edge snapshot/cache:
- `/api/public/dashboard?year=YYYY` mengambil data Google Sheets saat cache kosong, lalu menyimpan snapshot singkat di Cloudflare Cache API.
- Viewer berikutnya dilayani dari edge sehingga tidak setiap browser memukul Google Sheets API.
- Fresh cache sekitar 8 detik, dengan stale snapshot hingga 120 detik untuk menjaga dashboard tetap terlihat ketika Google/API sedang bermasalah.
- Response memakai ETag; browser dapat menerima `304` tanpa mengunduh JSON penuh ketika snapshot tidak berubah.
- Frontend polling 5 detik, tidak membuat request yang tumpang tindih, berhenti polling saat tab tidak terlihat, dan mempertahankan snapshot terakhir ketika koneksi sumber sedang terganggu.
- Layout diperkuat untuk layar HP/tablet, safe-area browser, sentuhan, dan angka panjang.

Catatan: cache meningkatkan skala secara signifikan, tetapi karena Cache API bersifat data-center-local, invalidation sempurna lintas seluruh edge tetap tidak instan. Target praktis adalah data publik tertinggal beberapa detik, bukan zero-latency.
