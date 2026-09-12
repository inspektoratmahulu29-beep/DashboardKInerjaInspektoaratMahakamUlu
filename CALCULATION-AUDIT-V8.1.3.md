# Calculation Audit V8.1.3

## Realisasi Fisik & Keu

- Kolom C (Anggaran): input/ringkasan sesuai struktur Excel.
- Kolom D (Bobot): anggaran baris ÷ anggaran induk × 100.
- Kolom E (Realisasi Fisik): **INPUT** pada baris detail; tidak boleh diturunkan dari kolom keuangan.
- Kolom F (Tertimbang): bobot × realisasi fisik ÷ 100.
- Kolom G (Realisasi Keuangan): input/ringkasan sesuai struktur Excel.
- Kolom H (% Keuangan): realisasi keuangan ÷ anggaran × 100.
- Kolom I (Keuangan Tertimbang): % keuangan × bobot ÷ 100.
- Kolom J (Sisa Dana): anggaran − realisasi keuangan.

Total tingkat kantor/program hanya memakai baris ringkasan yang sesuai dan tidak menjumlahkan induk + detail sekaligus.

## Import Excel

Saat workbook diimpor, formula yang secara semantik termasuk kolom input fisik E pada baris detail dinetralkan dan nilai selnya dipertahankan sebagai input. Formula turunan F/H/I/J dihitung ulang oleh dashboard.
