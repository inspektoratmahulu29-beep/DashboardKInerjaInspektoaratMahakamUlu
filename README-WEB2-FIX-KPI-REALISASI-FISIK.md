# Web 2 — V11.4 Exact Web 1 Physical KPI Sync

Perbaikan khusus KPI Realisasi Fisik. Logika sekarang meniru `getRealisasiTotals()` Web 1 V11.1 secara langsung: detail memakai kolom E sebagai sumber utama, H hanya fallback; kemudian weighted program summary; terakhir E/H baris kantor. Tidak menggunakan G/C sebagai pengganti fisik.

Ini penting karena workbook aktual Anda memiliki nilai fisik E yang berbeda dari persentase keuangan H. Dengan data workbook yang Anda lampirkan, weighted detail E menghasilkan sekitar 86,438381% (86,44%).

Cache key dinaikkan ke v=11.4. Tidak ada perubahan UI, KPI lain, routing, atau layout.
