# Userscript guide

Living description of `portal-farmare.user.js`: how it works, important decisions, and why those approaches are used. Agents and humans maintain this file so they do not have to rediscover everything from the code.

## Maintenance

- Keep this document **1:1 with the code**. After any behavioral or structural change to the userscript, update the matching sections here in the same task/commit set.
- Prefer accurate “how / why” over exhaustive line-by-line narration.
- Never paste personal or stable-specific data (owner names, animal counts, IDs, etc.).
- Skip updates only for pure typos or non-behavioral version bumps that do not change behavior or structure.

## Contents

Current code baseline: **v1.3.88** (`portal-farmare.user.js`).

### Purpose and scope

Tampermonkey userscript **Portál farmáře – zjednodušený (prasata + ovce)** runs on `https://(www.)mze.gov.cz/ssl/app/izr2far/*`. It overlays a simplified Czech UI for a **small single-farm holder of pigs and sheep** on IZR / Portál farmáře.

**Does:**

- Early boot overlay, then a rebuilt shell (`#pf-app`) with Domů / Ovce / Prasata navigation
- Home dashboard: subject scrapes + herd counts (pigs total; sheep total + male/female)
- Sheep/pig **Registr** and **Historie** with filtered grids / summaries, action toolbars, and embedded **Neodeslané změny** (send / cancel)
- Custom modals for pig buy/kill and sheep birth / buy / sell / home-kill / stolen; each fills the portal’s native jQuery UI dialogs under the hood
- Ear-mark order pages (`ZnamkyNoveOvc` / `ZnamkyDuplOvc`) wrapped in the shell
- Opt-out to native UI (`pf=off` / footer / boot exit) and a FAB to re-enable

**Does not:**

- Replace the portal backend or invent APIs — scrapes DOM + same-origin HTML and drives existing portal dialogs/grids
- Multi-farm / multi-stable UX (stable pickers are hidden; assumes one farm / one stable)
- General portal chrome (print/export, grid profiles, paging UI, pig 7-day ÚE jump link as primary nav)
- Persist farm identity beyond localStorage caches (counts, last-change dates, register URLs, partner lists, sheep subject ids)

### Entry, routing, and page roles

**Metadata:** `@run-at document-start`, `@grant none`. IIFE sets `window.PF`, then (if enabled) `PF.loader.show()` + progress hooks immediately. Full UI runs in `PF.boot` on `DOMContentLoaded` (or immediately if already loaded).

**Enable switch:** `?pf=on|off` (persisted as `localStorage['pf-simple-enabled']`). Default on. Early path uses `earlyEnabled()`; boot uses `isEnabled()`.

**`pageKind()`** (pathname + a few query/hash flags):

| Return | URL signal |
|--------|------------|
| `home` | `…/MujSubjekt` |
| `sheep-send` | `…/StajovyRegistrIndivZmeny` |
| `sheep-history` | `…/StajovyRegistrIndivPohyby` |
| `sheep` | `…/StajovyRegistrIndiv` (other Indiv* after more-specific matches) |
| `pig-send` | `…/StajovyRegistrPrasatZmeny` |
| `pig-history-redirect` | `…/StajovyRegistrPrasatPohyby` |
| `pig-reports` | `…/StajovyRegistrPrasatHlaseni` |
| `pig-history` | `…/StajovyRegistrPrasat` + `?pfView=history` or `#pf-history` |
| `pig` | `…/StajovyRegistrPrasat` (default) |
| `marks` | href contains `ZnamkyNoveOvc` or `ZnamkyDuplOvc` |
| `other` | everything else under the match |

**Boot redirects (before paint):**

- `sheep-send` / `pig-send` → corresponding Registr with `#pf-pending` (pending UI lives on Registr, not the Změny subpage)
- `pig-history-redirect` / `pig-reports` → `StajovyRegistrPrasat` + `pfView=history` (pig “Pohyby” / “Archiv hlášení” controllers are treated as dead/missing)

**In-app tabs:** Sheep Historie uses real `StajovyRegistrIndivPohyby`. Pig Historie is the **same register URL** with `pfView=history` (the Prasata register grid *is* change history).

**Boot render:** `home` → `PF.views.home`; register kinds → `PF.views.register` + `PF.registers.refresh`; `marks` → `PF.views.marks`; else → `PF.views.other`.

### Architecture and major modules

Global namespace: `window.PF`. Cross-cutting helpers (`jq`/`refresh$`, `norm`, `textOf`, `pageKind`, Czech date/label helpers, `PF._pfQuietMutate`) sit between Config and Styles.

| Module | Responsibility | Key surface | Interactions |
|--------|----------------|-------------|--------------|
| **`PF.loader`** | Boot splash + in-app busy overlay; hooks `$.progressDialog` | `show`/`hide`, `showBusy`/`hideBusy`, `holdBusy`/`releaseBusy`, `installProgressHooks` | Called at document-start and during saves; held overlay ignores portal progress open/close |
| **`PF.config`** | Paths, action catalogs, column keep/exclude lists | `base`, `home`, marks paths, `freeMarksPath`, `sheepDruhKey` (portal sheep species / `fiDruhZvirat`), `sheepActions`/`pigActions`, `*ColumnsKeep` | Consumed by shell, registers, pending, forms |
| **Utils (+ quiet mutate)** | DOM helpers, Czech formatting, enable flags | `pageKind`, `formatCzDate`, `friendlyDisplayText`, `isFilterChromeRow` | Quiet mutate sets `PF._pfMutating` so boot MutationObserver ignores PF’s own writes |
| **`PF.style`** | CSS: hide native chrome, skin shell/tables/modals | `inject()` | Boot adds `body.pf-simple` then `#pf-style` |
| **`PF.scrape`** | Subject, herd counts, register links, tabs; caches | `subject`, `herdCounts`, `registerLinks`, `tabLinks`, `classifySex`, `fetchSheepSexCounts`, `all` | Feeds views; caches `pf-link-*`, `pf-count-*` |
| **`PF.shell`** | `#pf-app` mount, nav, context tabs, footer, pending banners | `ensure`, `navHtml`, `contextLinks`, `swapController`, `bindPigActionDelegation`, `bindFooter` | Pig toolbar clicks delegated to `PF.pigForms` |
| **`PF.views`** | HTML templates only | `home`, `register`, `marks`, `other`, `icons` | Boot assigns `app.innerHTML`; host/toolbar/pending filled later |
| **`PF.confirmDialog`** | Promise-based styled confirm | `function(opts) → Promise<boolean>` | Pending cancel / destructive flows |
| **`PF.pending`** | Neodeslané změny on Registr | `refresh`, `parse`, `apply`, `renderTable`, Indiv+Zmeny merge, native select / Odeslat / Smazat | Sheep display from Indiv; IDs/actions from Zmeny |
| **`PF.registers`** | Move grids into `#pf-host`, toolbar, column filter, summaries | `refresh`, `moveContentToHost`, `buildToolbar`, `simplifyTables`, `render*RegisterSummary`, `invalidateHerdCaches` | Orchestrates pending on Registr |
| **`PF.datePicker`** | Minimal Czech calendar popup | `attach`, `parse`/`format`, `enhanceDialog` | Pig: `maxDaysBack: 7`; sheep: no future |
| **`PF.pigForms`** | Custom buy/kill → fill native DialogSRSkup / DialogPorizeni | `openBuy`/`openKill`, `runNative`, partner cache | Uses `holdBusy`, datePicker, cache invalidation after save |
| **`PF.sheepForms`** | Custom modals for sheep action typs; free marks | `openByTyp`, `openBirth`/`openBuy`/`openOut`/`openKill`/`openStolen` | Same native-fill pattern; NezaveseneZnamky |
| **`PF.dialogs`** | Observe/skin/simplify native `.ui-dialog`; soft-safe close | `observe`, `skin`, `simplifyDialog`, `ensureSafeDialogApi` | Boot always starts observer |
| **`PF.boot`** | Enable gate, redirects, first paint, ajaxComplete + MutationObserver | `PF.boot()` | Ties scrape → shell → views → registers/pending/dialogs |

Also exported: `PF.flushHerdCache`.

**Typical flow:** loader → boot → scrape.all → shell.ensure + view HTML → registers.refresh (move/simplify/toolbar/summary + pending.refresh) → dialogs.observe; later AJAX/DOM mutations re-enter registers.refresh unless settled / quiet-mutating / filtered URL.

### Important decisions (and why)

- **`@run-at document-start` + early loader** — Hide native FOUC; show farmer overlay before portal chrome; install progress hooks as soon as jQuery exists.
- **`@grant none` + `@sandbox raw`** — Stay in page JS context (Tampermonkey MAIN_WORLD) to call portal jQuery / `otevritDialogZmeny` / dialogs without GM sandbox bridges / `cloneInto`.
- **Hide native UI, rebuild shell** — CSS keeps original nodes off-layout but reachable; scrapers and form fillers still need live portal DOM.
- **Live jQuery lookup (`jq`/`refresh$`)** — Never trust a document-start `$` capture; call `refresh$()` before every `$` use. Portal loads jQuery after document-start (early binding caused `$.aq` / progressDialog / `ajaxComplete` failures — worse on Firefox’s true `document-start`).
- **`PF._pfQuietMutate` / `PF._pfMutating`** — PF DOM writes must not re-enter the body MutationObserver (refresh storms / resource exhaustion).
- **Full custom overlay + off-screen native submit** — Farmer sees PF dialogs; portal DialogSRSkup / DialogPorizeni filled and saved hidden so the official post path stays authoritative.
- **Pig history via `pfView=history`** — `StajovyRegistrPrasatPohyby` / `…Hlaseni` are dead/missing; history is the Prasata register grid itself.
- **Změny/send URLs redirect to Registr `#pf-pending`** — Pending UX is embedded; separate send pages are not first-class UIs.
- **Sheep pending = Indiv + Zmeny merge** — Display (note, sex, mother, dates) from Indiv pending/`stav=A`; cancel/send IDs and authoritative change labels from Zmeny; paint once both are ready.
- **Sheep Historie enrichment from Indiv** — Pohyby grid has event `POZNAMKA` (e.g. “Domácí porážka;”) and no sex; before paint, fetch Indiv `stav=A` and show register animal note (`POZNZVIRE`) + sex stripe (same as pending). Drop Matka on history; put Stav last (same Stav-last order on pig Historie).
- **Pig Historie / pending hide Konečný stav** — Column dropped from simplified tables; native `KONECNYSTAV` still scraped for Registr headcount / Poslední změna.
- **Herd vs pending split** — Unsent outbound animals can leave the “platné” herd filter; force `stavZvirat=A` and keep processed-in-ÚE but unsent outbound rows visible until send.
- **Pig Registr is summary-only** — Headcount + Poslední změna from first **zpracováno** history row’s **Konečný stav** / date on the Prasata grid — not a full animal list.
- **localStorage herd / last-change caches** — Useful across navigations; must invalidate after successful ÚE send (`invalidateHerdCaches`); manual recovery via `#pfFlushCache=1` / `PF.flushHerdCache()`.
- **Farmer overlay replaces `$.progressDialog`** — `holdBusy` survives portal open/close flicker during saves; idle overlay stays mounted but invisible.
- **Toolbar event delegation** (`data-pf-pig`) — Toolbar HTML rebuilds often; delegated clicks on `#pf-app` survive rebuilds.
- **Settled summaries (`dataset.pfSettled`)** — Once painted, skip full refresh teardown to avoid “Načítám…” flicker / pending loops.
- **ajaxComplete filters** — Ignore `pfInternal`, dead Prasata URLs, Zmeny fetches, `ChangeRowState`, dialog loads so helper traffic doesn’t rebuild the shell.
- **Pigs ≠ sheep URL contracts** — Pig grids use `idStaje` / `idStajovyRegistr`; sheep Zmeny needs `druhKey` — never mix sheep-style query params into pig grids.
- **Czech dates / friendly labels** — Farmer-facing `d. m. YYYY`; strip internal event codes; CZ plural helpers.
- **Pig date window 7 days** — Matches portal pig reporting rules; sheep dates allow past only (no future).
- **Safe dialog close hooks** — Soften `.dialog('close')` on uninitialized placeholders without replacing the whole `$.fn.dialog` bridge (that broke ShowModalInner).
- **Don’t invent portal DOM** — Prefer `sources/` HAR/HTML or a live DOM sample from the user; never hardcode personal/stable-specific data.

### Data sources and DOM/API contracts

**Paths (under `/ssl/app/izr2far`):**

- Home: `SubjektyProvozovny/MujSubjekt`
- Sheep: `StajoveRegistry/StajovyRegistrIndiv`, `…IndivPohyby`, `…IndivZmeny` (+ grid `…IndivZmenyGrid/Zmeny` with `provozovnaSRKey` / `stajovyRegistrKey` / `druhKey`)
- Pigs: `…/StajovyRegistrPrasat`, `…PrasatZmeny` (+ `…PrasatZmenyGrid/Zmeny`)
- Marks: `Hlaseni/HlaseniStareIzr?kam=ZnamkyNoveOvc|ZnamkyDuplOvc`
- Free sheep marks: `SubjektyProvozovny/VyhledaniUZNezavesene/NezaveseneZnamky` + configured `fiDruhZvirat` sheep species key
- Client flags: `pfView`, `pf`, `#pfFlushCache`

**DOM scrapes (high level):**

- Subject: detail headers, `td.member-editor-caption`, validation span ids, Kontakty group
- Herd counts on home: section **AKTIVNÍ PROVOZOVNY** only (left SR overview’s first numeric col is pending events, not headcount)
- Register links: `tr.grid-row` with detail icons; pending from **Neodeslané** column; tabs `.tabs-navlist a`
- Grids: `table.grid-table`, `table.dataTable`, `.grid`, `.tabs-content` under `#main`
- Sheep row rules: stav column, `.cervene` = removed in ÚE; pending outbound stay until processed
- Actions: `otevritDialogZmeny`, DialogPorizeni / DialogSRSkup / DialogPartneri; pending Odeslat / Smazat hlášení + portal Ano confirm
- Column keep lists match Czech header fragments / `data-colname`

**localStorage keys (non-PII):** `pf-simple-enabled`, `pf-count-pigs|sheep|sheep-male|sheep-female`, `pf-pig-last-change-v4`, `pf-sheep-last-change(-v2)`, `pf-link-sheep|pigs`, `pf-pig-staje-id`, `pf-pig-partners-v6`, `pf-sheep-subject-ids`.

### Stability and compatibility notes

- Targets Chromium **and** Firefox via Tampermonkey; `@grant none` + `@sandbox raw` prefer page context. Page CSP/jQuery timing matter more than GM APIs — prefer `.click()` over `eval`/`new Function` when driving portal controls.
- Fragile: portal grid AJAX timing, dialog init order, caption/`data-colname` text, Zmeny vs Indiv shape, species row icons on MujSubjekt, dead pig grid URLs (`isDeadUrl` / `markDeadUrl`).
- CSS may use modern selectors (e.g. `:has(.progress-dialog)`); JS progress hooks still run when CSS alone is incomplete.
- Single-stable assumption: farm/stable pickers hidden — multi-stable accounts will look wrong.
- Intentionally non-features: print/export, grid filter UI, native pending yellow banner (replaced by `.pf-pending-hint`), pig 7-day ÚE movements link.
- If simplified sheep table fails, native grid is left visible rather than blank host.
- Disable path leaves a pulse FAB “Zapnout jednoduchý režim”.

### Ops helpers

| Helper | Effect |
|--------|--------|
| `?pf=on` / `?pf=off` | Force enable/disable + persist |
| `#pfFlushCache=1` | One-shot clear herd-count / Poslední změna keys, strip flag, reload |
| `PF.flushHerdCache()` / `('pig'\|'sheep')` | Console: invalidate + re-render summary on matching page |

Hash params preferred; query still accepted for backwards compatibility.
