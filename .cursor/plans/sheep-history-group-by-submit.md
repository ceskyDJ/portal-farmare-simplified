# Sheep Historie: group by submission

## Goal
Group sheep history rows by register submission batch (`Datum odeslání` / `DATUMCASODESLANI`) so many births/kills from one send are easy to scan. Keep UI minimal.

## Approach
- Sheep Historie only (`sheep-history`).
- Package consecutive rows by calendar submission date (`dateOnlyText` of `DATUMCASODESLANI`).
- Each package: bordered card + label **Hlášení z d. m. YYYY** (sentence case, not thead style) + mini-table.
- Drop the visible **Datum nahlášení** column.
- Preserve portal row order; do not re-sort.

## Done when
- `node --check portal-farmare.user.js` passes.
- `@version` bumped; `docs/userscript.md` updated 1:1.
- Changes committed.
