# Dashboard Realisasi Kinerja — V8

Dashboard React/Vite untuk **Inspektorat Daerah Kabupaten Mahakam Ulu** dengan 14 kertas kerja sumber, editor inline, formula otomatis, multi-tahun, import/export Excel, dan ringkasan KPI.

## Fitur utama
- 14 sheet kertas kerja tetap terhubung ke dashboard.
- Formula otomatis untuk enam sheet Capaian Sasaran.
- Formula otomatis untuk **Realisasi Fisik & Keu** sesuai struktur grup program:
  - D Bobot
  - F Fisik Tertimbang
  - H % Keuangan
  - I Keuangan Tertimbang
  - J Sisa Dana
  - ringkasan C/G per program dan total.
- Monev Renaksi IKU, Monev Program, dan PKPT dihitung sebagai **virtual KPI** tanpa menimpa kolom input.
- Editor per baris + tambah baris fleksibel + auto-wrap + duplikasi/hapus.
- Manajemen Tahun Anggaran: tambah tahun, salin data, atau template kosong.
- **Import Excel**: baca seluruh workbook `.xlsx/.xls`, deteksi tahun, pertahankan nilai cache formula eksternal bila tersedia, lalu hitung ulang formula yang dikenal.
- **Export Excel**: sheet aktif atau seluruh 14 sheet + ringkasan Dashboard. File `.xlsx` dapat dibuka di Excel atau diunggah ke Google Sheets.
- Audit formula menampilkan error nilai dan referensi eksternal.
- Workbook sumber juga telah diperbaiki: formula capaian dan realisasi dibangun ulang, referensi eksternal tanpa sumber diganti menggunakan nilai cache yang tersedia, dan ditambahkan sheet `Audit Formula`.
- Import Excel memilih salah satu dari tiga mode: perbarui TA aktif, buat/perbarui TA dari tahun file, atau gabungkan sheet. Formula lokal yang dikenali dihitung ulang setelah import.

## Deploy Cloudflare Pages
- Framework preset: **React (Vite)**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: kosong (repository root)

## Data sumber
`public/data/workbook.json` berasal dari workbook kertas kerja yang diperbaiki. Penyimpanan hasil edit browser masih menggunakan `localStorage`; untuk sinkronisasi lintas komputer diperlukan backend/database bersama. File `.xlsx` hasil ekspor dapat diunggah ke Google Sheets, tetapi belum merupakan sinkronisasi langsung ke Google Sheets API.


## V9 — Google Sheets pusat / multi-user

V9 menambahkan koneksi langsung ke satu Google Spreadsheet pusat melalui **Cloudflare Pages Functions**. Browser hanya berbicara ke `/api`; private key service account tidak pernah dikirim ke browser. Google Sheets API mendukung `values.batchGet`, `values.batchUpdate`, dan append/update values; V9 memakai batch read/write agar 14 sheet dapat disinkronkan secara efisien.

### Struktur spreadsheet pusat

Satu spreadsheet pusat menyimpan tab per tahun dengan pola:
`2026__IKU`, `2026__Rencana Aksi`, ... `2026__Realisasi Fisik & Keu`.

Sistem juga membuat tab `__META__` yang menyimpan revision, waktu update, dan jumlah sheet. Revision digunakan untuk mendeteksi dua operator yang menyimpan data bersamaan. Jika revision berubah, dashboard menolak overwrite dan memuat data terbaru dari pusat.

### Fitur sinkronisasi

- Dashboard membaca database pusat saat dibuka.
- Polling setiap 5 detik saat tidak ada edit lokal.
- Simpan perubahan ke Google Sheets pusat setelah login operator.
- Tambah Tahun Baru: penyimpanan tahun baru otomatis membuat 14 tab tahun tersebut.
- Import Excel tetap bisa dilakukan melalui UI, lalu klik **Simpan** untuk mengirim hasil import ke Google Sheets pusat.
- Export Excel tetap tersedia.

### Setup Google Cloud + Google Sheets

1. Buat atau pilih project di Google Cloud.
2. Aktifkan **Google Sheets API**.
3. Buat **Service Account**.
4. Buat credential JSON untuk service account dan simpan privat.
5. Buat satu Google Spreadsheet pusat, misalnya `DATABASE REALISASI KINERJA — INSPEKTORAT DAERAH KABUPATEN MAHAKAM ULU`.
6. Ambil `Spreadsheet ID` dari URL, yaitu bagian di antara `/d/` dan `/edit`.
7. Klik **Share** pada spreadsheet, tambahkan email service account sebagai **Editor**. Untuk akses ke file Sheet tertentu, Google mendokumentasikan bahwa direct document sharing cukup; domain-wide delegation tidak dibutuhkan.

### Secret Cloudflare

Di **Workers & Pages → project → Settings → Variables and Secrets**, tambahkan sebagai Secret/Encrypted:

`GOOGLE_SPREADSHEET_ID`
`GOOGLE_SERVICE_ACCOUNT_JSON`
`ADMIN_PASSWORD`
`SESSION_SECRET`

Jangan memasukkan private key JSON ke `main.jsx`, `centralApi.js`, GitHub, atau `wrangler.toml`. Cloudflare mendukung Secrets yang hanya tersedia ke runtime Worker/Pages Function.

### Cara deploy

Repository root tetap digunakan:
- Framework preset: **React (Vite)**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: kosong

Folder `functions/` ikut ter-deploy sebagai Pages Functions.

### Bootstrap data awal

Setelah secret selesai, buka dashboard. Jika spreadsheet pusat kosong, aplikasi masih memakai data lokal sebagai fallback. Import workbook Excel Anda melalui **Kertas Kerja → Import Excel**, pilih tahun yang sesuai, lalu tekan **Simpan** dan login operator. Data akan menjadi sumber pusat Google Sheets.

### Keamanan

GET database dibuat untuk dashboard, sedangkan operasi write membutuhkan session operator. Session menggunakan cookie HttpOnly + signature HMAC. Untuk peningkatan keamanan produksi, tambahkan Cloudflare Access atau SSO di depan area operator.
