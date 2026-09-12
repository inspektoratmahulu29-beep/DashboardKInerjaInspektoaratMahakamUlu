# Dashboard Kinerja Inspektorat Daerah Kabupaten Mahakam Ulu — V8 (sebelum Google API)

Baseline dashboard sebelum koneksi Google Sheets API/database pusat ditambahkan.

Fitur yang dipertahankan:
- Dashboard KPI interaktif
- Kertas kerja 14 sheet
- Edit & Input
- Tambah baris fleksibel
- Auto-wrap teks
- Perhitungan otomatis
- Penugasan / Realisasi / Kinerja dapat diedit
- Multi Tahun Anggaran
- Import Excel (.xlsx/.xls) ke database lokal browser
- Export Excel sheet aktif / semua sheet
- Export/Import JSON

Penyimpanan V8 ini menggunakan localStorage browser. Tidak ada Google Sheets API, Pages Functions, service-account key, atau database pusat di source ini.

## Cloudflare Pages
Framework preset: React (Vite)
Build command: `npm run build`
Build output directory: `dist`
Root directory: kosong
