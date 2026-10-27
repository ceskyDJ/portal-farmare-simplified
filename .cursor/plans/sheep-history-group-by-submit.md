# Sheep Historie: group by submission

## Goal
Group sheep history rows by register submission batch (`Datum odeslání` / `DATUMCASODESLANI`) so many births/kills from one send are easy to scan. Keep UI minimal.

## Approach
- Sheep Historie only (`sheep-history`).
- Group consecutive rows by exact submission datetime (not calendar day alone — same-day sends stay separate).
- Insert a thin muted full-width group header row when the batch key changes.
- Drop the visible **Datum nahlášení** column; the date/time lives only in the group header.
- No collapse, counts, or cards.
- Preserve portal row order; do not re-sort.

## Done when
- `node --check portal-farmare.user.js` passes.
- `@version` bumped; `docs/userscript.md` updated 1:1.
- Changes committed.
