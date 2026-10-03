# Toast notifications

## Goal
Replace portal `#messages-box` / `.message-box` ("Data byla uložena") with PF toasts; use them for action feedback.

## Approach
1. Hide `#messages-box` under `body.pf-simple`.
2. Add `PF.toast` (top-right, success/error/info, auto-dismiss, click-to-dismiss, `aria-live`).
3. Hook `$.aq.zobrazitZpravu` / `$.aq.zobrazitChybu` to **swallow** portal copy (do not show it).
4. Farmer copy from `PF.toast.saved(kind, typ, data)` after pig/sheep `runNative`, plus stash/success for pending cancel/send.
5. Replace action `alert()` calls with toasts; toast on disabled sheep-action click (`data-pf-warn`).
6. Keep in-modal field/form errors as-is (not toasts).
7. Queue toasts while boot/busy overlay covers the UI; `flush()` after overlay hide.
8. Drop server-rendered `#messages-box` nodes; `sessionStorage` stash for cancel/send navigations.
9. Docs + semver bump; `node --check`.

## Placement
Top-right — standard for LTR; away from primary reading/action column.
