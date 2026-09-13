# Web 2 V12 — Physical KPI fix

Perbaikan terbatas pada KPI Realisasi Fisik.

Penyebab yang ditangani:
Google Sheets dapat sementara mengembalikan hasil formula kolom E sebagai 0
ketika kolom tersebut belum selesai recalculation, sementara H pada baris detail
sudah berisi nilai numerik. Versi sebelumnya menganggap E=0 sebagai nilai final,
sehingga weighted physical KPI menjadi 0.

Perubahan:
- Detail fisik: E menjadi sumber utama; bila E==0 dan H>0, gunakan H sebagai fallback.
- Ringkasan program memakai aturan fallback yang sama.
- Dashboard frontend memakai URL versi v=12 untuk melewati cache URL lama.
- Cache key backend dinaikkan ke v=12.0.
- Tidak menyentuh Web 1, KPI lain, layout, atau routing.
