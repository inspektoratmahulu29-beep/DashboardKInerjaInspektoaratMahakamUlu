# Calculation Audit V8.1.2

## Correct basis for Dashboard KPI
- Total Anggaran: `Realisasi Fisik & Keu!C10` (office total). Fallback: sum only top-level program summary rows.
- Total Realisasi Keuangan: `Realisasi Fisik & Keu!G10`. Fallback: sum only top-level program summary rows.
- Serapan: `Total Realisasi Keuangan / Total Anggaran × 100`.
- Realisasi Fisik: use official office value `E10` when present; otherwise weighted average from top-level program summaries.
- Detail program/subkegiatan rows are never added to the office total when their parent summary is already present. This prevents double counting.

## 2026 source check
Expected totals from the submitted workbook:
- Anggaran: Rp 17.588.768.787
- Realisasi Keuangan: Rp 15.986.004.220
- Serapan: 90,887568% (~90,9%)

## Other guarded metrics
- PKPT status rows end before the `REALISASI OUTPUT PENUGASAN / SATUAN HASIL` section; numeric output-summary rows are not counted as status items.
- Capaian percentage columns use Target vs Realisasi and are recalculated without overwriting input columns.
- Financial percentage columns use Realisasi Anggaran / Pagu Anggaran.
