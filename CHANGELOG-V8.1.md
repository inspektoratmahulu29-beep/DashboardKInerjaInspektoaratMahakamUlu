# V8.1 Import Engine — Changelog

## Added
- Import preview without immediate database mutation.
- Schema mapping for the 14 expected kertas kerja sheets.
- Exact/fuzzy/missing/new mapping states.
- Formula/error/external-reference audit before import.
- Automatic import backup before apply.
- Automatic rollback when import processing fails.
- Manual rollback of the last successful import.
- Import/rollback audit trail in browser storage.
- Export of audit history as JSON.
- Workbook presentation metadata capture: merges, column widths, row heights, views, and autofilter.
- Source workbook template retention for export round-trip.

## Safety model
- Imported data is staged in memory until the user presses Apply.
- Missing or fuzzy sheet mappings are shown as warnings before Apply.
- External formulas are never fabricated; cached values are retained when available.
- Private credentials are not involved in this baseline; Google API remains out of scope for V8.1.

### V8.1.1 – Storage quota fix
- Memindahkan database besar, backup import, template Excel, dan audit ke IndexedDB.
- localStorage hanya dipakai untuk metadata kecil (tahun aktif) dan migrasi legacy.
- Memperbaiki kegagalan import saat browser mencapai kuota localStorage.
- Rollback import sekarang asynchronous dan aman terhadap database besar.

## V8.1.2 — Calculation Fix
- Fixed dashboard double-counting in Total Anggaran and Total Realisasi Keuangan.
- KPI totals now use office total/top-level program summaries only.
- Added dynamic Realisasi structure detection and calculation audit metadata.
- PKPT status range now stops before output summary section.
- Added CALCULATION-AUDIT-V8.1.2.md.
