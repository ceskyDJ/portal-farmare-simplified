# Incidents

Living log of non-trivial problems and how they were resolved. Agents maintain this file.

## Maintenance

- **Append only.** After resolving a high-effort, non-trivial incident, add a new record.
- **Never edit** older records.
- **Remove only** when an entry is no longer relevant (do not rewrite it).
- Newest records first.
- Skip trivial one-liners / typos—those do not belong here.
- May generalize slightly (e.g. class of DOM race), but stay concrete enough that the next agent can recognize the same failure.
- Never include personal or stable-specific data (owner names, animal counts, IDs, etc.).

## Record schema

```markdown
### <ISO-8601 timestamp> — <short-name> [<userscript @version or git sha>]
**When:** when exactly the problem occurred (version, flow, page/action, conditions)
**Core:** what the underlying problem was
**Symptoms:** how it showed up (what was happening / what the user or agent saw)
**Resolution:** how it was fixed
```

## Records

<!-- Distilled from development sessions that built portal-farmare.user.js (primarily 2026-09-30 → 2026-10-01). Append new records below this line, newest first. -->

### 2026-10-03 — toast-flash-before-reload [1.4.2→1.4.3]
**When:** After custom toast copy (v1.4.2); sheep birth save and pending cancel.
**Core:** `#messages-box` MutationObserver called `flush()`/`takeStash()` before navigation (toast painted then page reloaded); saves only queued in memory without stash (lost on reload).
**Symptoms:** Cancel toast visible for a moment until reload; birth toast never appeared after reload/animation.
**Resolution:** `announce()` stashes+queues without painting; observer only strips portal nodes; `beginNavigate()` blocks paint before `location` changes; `flush()` after boot/busy; stash cleared on dismiss for reload recovery.

### 2026-10-03 — toast-hidden-under-boot-busy [1.4.0→1.4.1]
**When:** After introducing `PF.toast` (v1.4.0); sheep birth save and pending cancel.
**Core:** Toasts painted (or portal `#messages-box` flashes discarded) while boot/busy overlays covered the screen; dismiss timers started under the overlay; cancel navigations wiped in-memory toasts and the hook swept server-rendered boxes without adopting them.
**Symptoms:** No visible notifications after save/cancel; user wondered if messages appeared only under the loading animation.
**Resolution:** Queue toasts while boot/busy is up; `flush()` after overlay hide; `consumePortalBoxes()` + MutationObserver; `sessionStorage` stash for cancel/send navigations.

### 2026-10-01 — sheep-pending-loader-until-ready [1.3.81]
**When:** Sheep Registr — pending “Neodeslané změny” panel after Indiv/Zmeny dual-source work.
**Core:** Pending UI painted from Indiv first, then Zmeny enriched fields later; loader released before both sources settled.
**Symptoms:** Pending table appears, then values jump; farmer loader gone while rows still incomplete.
**Resolution:** Hold farmer loader until Indiv + Zmeny pending data are both ready; paint pending once; normalize “Změna” labels.

### 2026-10-01 — sheep-pending-dual-source [1.3.77–1.3.80]
**When:** Sheep pending panel (births, home kill, move-out, and similar).
**Core:** Herd/Indiv table lacks some outbound events; Zmeny grid lacks sex/note fields needed for a good display.
**Symptoms:** Pending incomplete if taken only from herd; wrong/missing notes if taken only from Zmeny; flash when switching sources.
**Resolution:** Display pending from Indiv (`stav=A`, yellow/`založeno`); use Zmeny only for cancel/send IDs/URLs (match by ear); paint with herd, attach Zmeny IDs in background.

### 2026-10-01 — sheep-vanish-on-pending-outbound [1.3.78]
**When:** Sheep Registr after creating a pending outbound change (kill/move/stolen) before ÚE send.
**Core:** Default “platné” filter drops animals already marked outbound in the portal UI.
**Symptoms:** Animal disappears from the main herd table while the change is still unsent.
**Resolution:** Force `stavZvirat=A`; keep rows with Stav přísun = zpracováno and not red (`.cervene`); red / non-`zpracováno` (e.g. `založeno`) stay out of herd counts / go to pending.

### 2026-10-01 — poznamka-substring-column-match [1.3.74]
**When:** Sheep pending column filter.
**Core:** Column match treated `znamka` as a substring of `poznamka`, so **Poznámka přísun** was kept instead of the animal note.
**Symptoms:** Wrong note column in the pending table.
**Resolution:** Explicitly exclude **Poznámka přísun**; keep animal **Poznámka**.

### 2026-10-01 — sheep-register-404-html-inject [1.3.69–1.3.70]
**When:** Sheep Registr load after wiring pending Zmeny fetch.
**Core:** Pending request used guessed/missing `druhKey` → portal 404 HTML; response moved into register host; full refresh on every AJAX.
**Symptoms:** After a delay: “Dokument nebyl nalezen” instead of the sheep list; empty pending.
**Resolution:** Resolve `druhKey` from page/config; never inject 404/error HTML; ignore failed pending fetch; stop full sheep refresh on every AJAX; prefer exact Zmeny grid URL from the page.

### 2026-10-01 — sheep-birth-fill-no-labels [1.3.67–1.3.68]
**When:** Sheep Narození save via custom dialog → off-screen native DialogPorizeni.
**Core:** Grid row has no per-field labels; fillers ran before the row was ready; ear marks needed compact form; stáj needs autocomplete pick.
**Symptoms:** “Nepodařilo se najít tlačítko Uložit”; only ear mark filled (or wrong spaced form); other fields empty.
**Resolution:** Wait for animal row; fill known portal field selectors (date, pohlaví, parents, note); strip spaces on ear mark for the portal; pick stáj via autocomplete / current-stable key; `#pfDebugNative=1` for watch mode.

### 2026-10-01 — pending-delete-needs-dotaz-ano [1.3.53–1.3.55]
**When:** Cancel one/all pig pending changes (“Zrušit”).
**Core:** Cancel navigated/broke the portal instead of selecting **K odeslání** rows → **Smazat hlášení** → jQuery **Dotaz** → **Ano**.
**Symptoms:** Underlying app crash / cancel no-op; debug selection alone was insufficient.
**Resolution:** Select native pending rows, click Smazat, wait for Dotaz and confirm Ano; styled confirm modal instead of `alert`; `#pfDebugPendingDelete=1` stops before Smazat.

### 2026-10-01 — herd-cache-stale-after-send [~1.3.5x]
**When:** After successful “Odeslat změny” on pig register.
**Core:** `localStorage` herd stats (count / Poslední změna) not invalidated on send.
**Symptoms:** UI still shows pre-send count and date though the portal shows **zpracováno**.
**Resolution:** Invalidate herd caches after successful send; add `#pfFlushCache=1` and `PF.flushHerdCache()` for manual recovery.

### 2026-10-01 — pig-count-from-history-konecny-stav [~1.3.5x]
**When:** Pig Registr summary after cache flush / send to ÚE.
**Core:** Count scraped the wrong grid (summing history event totals) or the wrong column; sometimes skipped the real Prasata grid URL.
**Symptoms:** Count shows nonsense total (e.g. sum of events) or 0; date can break with it.
**Resolution:** Take count + date from the first **zpracováno** history row that has both **Datum změny** and **Konečný stav** on the Prasata grid; treat 0 carefully; don’t skip the Prasata URL.

### 2026-10-01 — posledni-zmena-must-be-zpracovano [1.3.51–1.3.52]
**When:** Pig Registr “Poslední změna”.
**Core:** Latest history row used regardless of Stav; when Stav column undetected, the filter was a no-op; stale cache key kept mixed dates.
**Symptoms:** Date updates from pending/unprocessed rows.
**Resolution:** Only **zpracováno** rows; skip tables without that state; bump cache key.

### 2026-10-01 — farmer-overlay-flash-vs-progressDialog [1.3.44–1.3.46]
**When:** Saving pig/sheep events (custom dialog → native fill → Uložit).
**Core:** Portal `$.progressDialog` open/close remounted/tore down the farmer overlay mid-save.
**Symptoms:** Farmer animation opens, flashes blank, restarts; icon/text blinks away.
**Resolution:** Hook `$.progressDialog` to the farmer overlay; while save holds busy, ignore portal progress open/close; keep overlay mounted (invisible when idle) until `releaseBusy()`.

### 2026-10-01 — pig-native-fill-wrong-fields [1.3.37–1.3.43]
**When:** Pig Domácí porážka / Nákup save.
**Core:** Leftover `#dialogDiv` broke ShowModal; null text helpers crashed; wrong inputs filled; save closed without a real submit.
**Symptoms:** “Vypršel čas čekání na dialog”; TypeError; dialog vanishes with no pending; “Portál hlášení neuložil”.
**Resolution:** Reset dialog host; cache real stáj GUID; guard null text; fill the portal’s pig dialog fields (`rsrp-*`); click only Uložit; verify pending appears; `#pfDebugNative=1`.

### 2026-10-01 — sheep-action-dialog-prior-to-init [1.3.16–1.3.17]
**When:** Sheep toolbar actions (Narození, etc.).
**Core:** Called broken `otevritDialogZmeny` (`dialog('close')` before init); wrong stáj/provozovna combo id.
**Symptoms:** Console “cannot call methods on dialog prior to initialization”; alert “Vyskytla se chyba”.
**Resolution:** Open via portal ShowModal / DialogPorizeni; use plain stáj id; clear stale `#dialogDiv`; skip refresh while dialog loads.

### 2026-10-01 — sheep-register-disappear-rebuild-loop [1.3.6–1.3.9]
**When:** Sheep Registr after chrome-hiding / simplify changes.
**Core:** Grid left under clipped `#main`; chrome hide wrapped the whole animal grid; row-count rebuild loop; checkbox AJAX rebuilt the table.
**Symptoms:** Sheep table missing / whole register blank; select-all won’t stick / blinks.
**Resolution:** Re-home grid into host; don’t swallow grid when hiding stáj/print; stop rebuild loop; don’t rebuild table on row-checkbox AJAX.

### 2026-10-01 — partner-list-pollution-and-visibility [1.2.7–1.3.2]
**When:** Pig Nákup partner dropdown.
**Core:** Partners scraped from the wrong host (own stáj mixed in); DialogPartneri needs live row key; `visibility:hidden` native dialog made `activeDialog()` fail.
**Symptoms:** Own stable in partner list; garbage partner labels; partner load hangs/empty.
**Resolution:** Load from Partneri / DialogPartneri path; strip stáj picker before parse; don’t drive dialogs that are `visibility:hidden`; follow partner grid AJAX URL.

### 2026-09-30 — mutationobserver-zmeny-storm [1.1.4–1.1.5]
**When:** Pig Registr with pending/summary refresh.
**Core:** Wrong Prasata query params (sheep-style keys) → 500; `ajaxComplete` + MutationObserver: DOM write → refresh → Zmeny fetch → DOM write; pig grids lacked a “already simplified” mark.
**Symptoms:** Console 500 spam; `ERR_INSUFFICIENT_RESOURCES` storm.
**Resolution:** Correct pig id params; mark dead URLs; ignore own AJAX; load pending once; quiet-mutate / settle summary before re-refresh.

### 2026-09-30 — jquery-captured-at-document-start [1.1.7]
**When:** Opening pig native modal / progress hooks at `@run-at document-start`.
**Core:** Top-level `$` captured before jQuery exists → methods on undefined.
**Symptoms:** `TypeError: Cannot read properties of undefined (reading 'aq')` (and similar).
**Resolution:** Live `$` lookup via `jq()` / `refresh$()`; remove dead early jQuery checks.

### 2026-09-30 — pig-history-pohyby-404
**When:** Pig Historie nav / original UI after script navigation.
**Core:** Historie pointed at a non-existent Pohyby URL.
**Symptoms:** History never loads; original UI shows 404.
**Resolution:** History is the register grid (`StajovyRegistrPrasat` / Prasata); Historie opens that view via `pfView=history`.

### 2026-09-30 — dashboard-counts-overwritten-by-zero
**When:** Home (MujSubjekt) after AJAX refresh.
**Core:** Scraper read left overview “Neodeslané = 0” columns after AJAX.
**Symptoms:** Correct pig/sheep counts flash then become 0.
**Resolution:** Scrape only **AKTIVNÍ PROVOZOVNY**; keep last good values if that section is unread.

### 2026-09-30 — ear-marks-misread-as-unsent-changes
**When:** Home sheep pending badge.
**Core:** Badge used available/unused ear-mark inventory as the unsent-events count.
**Symptoms:** False “unsent changes” alert from ear-mark inventory.
**Resolution:** Scrape only the real unsent-events count.

### 2026-09-30 — pig-headcount-parsed-years-from-dates
**When:** Pig Registr summary.
**Core:** Numeric scrape treated years in dates as headcount.
**Symptoms:** Wrong pig number; dash for last change.
**Resolution:** Tighten headcount parsing; last change from history grid (later refined to **Konečný stav** / **zpracováno**).
