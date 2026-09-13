# Web 2 V12.1 — Realisasi Fisik 0% fix

**Web 1 tidak diubah.**

Perubahan hanya untuk KPI Realisasi Fisik Web 2:
- Jika kolom E (Realisasi Fisik) bernilai valid > 0, gunakan E.
- Jika E kosong/null, gunakan H sebagai fallback.
- Jika E bernilai 0 namun H > 0, anggap E sedang stale dari formula Google Sheets dan gunakan H.
- Ini mencegah KPI weighted turun menjadi 0 saat Google Sheets belum mengevaluasi formula E.
- Cache key dan URL publik diberi versi 12.1 agar response/cache lama versi sebelumnya tidak dipakai.
- Response backend menambahkan `x-physical-kpi-rule` untuk diagnosis.
Tidak ada perubahan pada KPI lain, UI, routing, atau Web 1.
