# Web 2 — Fix KPI Realisasi Fisik

Patch ini hanya menyentuh sumber perhitungan KPI **Realisasi Fisik** pada Web 2 publik dan cache key-nya. Bagian UI, KPI lain, routing, responsive layout, dan mekanisme publik lainnya tidak diubah.

## Sumber perhitungan
Logika disamakan dengan Web 1 V11.1:
- Sheet: `Realisasi Fisik & Keu`
- C = Anggaran
- E = Realisasi Fisik (%)
- H = Realisasi Keuangan (%), dipakai sebagai fallback per baris jika E masih blank/error
- KPI utama = `SUM(Anggaran detail × Realisasi Fisik detail) / SUM(Anggaran detail)`
- fallback: weighted program summary
- fallback terakhir: baris kantor `I / INSPEKTORAT`

Untuk workbook yang dilampirkan, hasil yang diharapkan adalah sekitar **86.438381% (86,44%)** dengan 28 detail fisik valid.

Cache key API dinaikkan ke `v=11.2` agar snapshot fisik 0 dari versi sebelumnya tidak terbawa.

Deploy Web 2 hasil patch ini lalu refresh browser. Tidak perlu mengubah Web 1.
