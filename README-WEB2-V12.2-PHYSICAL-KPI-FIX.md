# Web 2 V12.2 — Realisasi Fisik robust recovery

**Web 1 tidak diubah.**

Fokus hanya pada KPI Realisasi Fisik Web 2.

Per-row recovery order:
1. Kolom E Realisasi Fisik jika numeric dan tidak nol.
2. Kolom H jika E kosong/stale/0.
3. Kolom G ÷ C × 100 sebagai last-resort detail recovery bila E dan H tidak dapat
   dibaca. Pada template workbook ini, untuk baris detail memang berlaku E = H =
   G/C × 100 berdasarkan formula yang ada, sehingga fallback ini memulihkan KPI
   ketika Google Sheets tidak menyajikan hasil formula E/H.

Aggregate KPI tetap dihitung weighted berdasarkan Anggaran (C), sehingga target
current workbook tetap sekitar 86,44%.

Selain itu:
- URL frontend diberi `v=12.2`.
- Cache key backend diberi `v=12.2`.
- Response menandai rule recovery di `x-physical-kpi-rule`.
- KPI lain, UI, routing lain, dan Web 1 tidak diubah.
