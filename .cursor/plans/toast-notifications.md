# Toast notifications

## Goal
Replace portal `#messages-box` / `.message-box` ("Data byla uložena") with PF toasts; use them for action feedback.

## Approach
1. Hide `#messages-box` under `body.pf-simple`.
2. Add `PF.toast` (top-right, success/error/info, auto-dismiss, click-to-dismiss, `aria-live`).
3. Hook `$.aq.zobrazitZpravu` / `$.aq.zobrazitChybu` → `PF.toast` (same pattern as progressDialog hooks).
4. Replace action `alert()` calls with toasts; toast on disabled sheep-action click (`data-pf-warn`).
5. Keep in-modal field/form errors as-is (not toasts).
6. Queue toasts while boot/busy overlay covers the UI; `flush()` after overlay hide.
7. Adopt server-rendered `#messages-box` nodes + `sessionStorage` stash across cancel/send reloads.
8. Docs + semver bump; `node --check`.

## Placement
Top-right — standard for LTR; away from primary reading/action column.
