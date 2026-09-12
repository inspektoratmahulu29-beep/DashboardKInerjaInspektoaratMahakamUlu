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
