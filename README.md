## V8.1.3 Calculation Safety Patch

Perbaikan penting: KPI Total Anggaran dan Total Realisasi Keuangan kini hanya menggunakan total kantor/summary program tingkat atas, bukan menjumlahkan baris induk + detail sekaligus. Ini mencegah double-counting. Struktur import tetap fleksibel.

Target 2026 pada workbook master yang digunakan untuk validasi:
- Anggaran: Rp 17.588.768.787
- Realisasi Keuangan: Rp 15.986.004.220
- Serapan: 90,887568%

# Dashboard Realisasi Kinerja — Inspektorat Daerah Kabupaten Mahakam Ulu

Baseline V8 tanpa Google Sheets API/database pusat. Source ini mengikuti workbook `2026_Dashboard_Kertas_Kerja_Inspektorat_Mahakam_Ulu_FULL_REVISI.xlsx` dan mempertahankan 14 sheet kertas kerja.

## Fitur
- Dashboard KPI interaktif.
- Total Anggaran dipisahkan dari Total Realisasi Keuangan.
- Formula Realisasi Fisik & Keu mengikuti hierarki workbook dan menghindari double counting.
- Enam sheet capaian memiliki kalkulasi % capaian dan % realisasi anggaran.
- Edit langsung, tambah baris fleksibel, wrap text, duplikat/hapus baris.
- Tambah Tahun Baru, salin tahun, template kosong.
- Import Excel dan Export Excel.
- Workbook sumber 14 sheet tersedia di `public/data/workbook.json`.

## Deploy Cloudflare Pages
- Framework: React (Vite)
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: kosong

## Import Excel
Gunakan menu `Edit & Input` atau `Kertas Kerja` → `Import Excel`.
Pilihan:
- **Perbarui TA aktif**: mengganti isi tahun yang sedang dipilih dengan isi Excel.
- **Buat/Perbarui TA dari file**: membuat/memperbarui tahun sesuai tahun yang terdeteksi dari workbook.
- **Gabungkan sheet**: memperbarui sheet yang ada dari file Excel tanpa menghapus sheet lain.

## Formula
Lihat `FORMULA-LOGIC.md` untuk rincian formula dan aturan agregasi yang digunakan.

## Catatan
Penyimpanan V8 ini masih `localStorage` per browser. Belum ada Google Sheets API/database pusat. Versi ini sengaja dipertahankan sebagai baseline sebelum koneksi pusat ditambahkan.

## V8.1 Import Engine

V8.1 adds a guarded Excel import pipeline designed for the Mahakam Ulu kertas kerja:

- preview before import
- 14-sheet schema mapping with exact/fuzzy/new/missing status
- formula audit (error values and external references)
- presentation preservation metadata (merges, column widths, row heights, views, autofilter)
- source workbook template retention for export round-trip
- automatic backup before applying an import
- rollback of the last import
- import audit trail stored locally
- three import modes: update active year, import as new year, merge sheets
- flexible year detection and normalization

The website remains local/offline in this V8.1 baseline; no Google API is included.


## V8.1.4 — Empty Sheet Recovery
- Memulihkan sheet yang tersimpan kosong dari workbook sumber saat startup tanpa menimpa sheet yang sudah berisi data operator.
- Import active-year mempertahankan sheet lama yang tidak ada/bermasalah di file import dan hanya mengganti sheet import yang valid serta tidak kosong.
- Monev output utama/penunjang menggunakan kolom input workbook yang benar untuk KPI.
