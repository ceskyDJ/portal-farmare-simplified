# Portál farmáře – simplified (pigs + sheep)

A Tampermonkey userscript that overlays a simpler UI on the official Czech **Portál farmáře / IZR** (`mze.gov.cz`) for very small farms that keep **pigs and/or sheep**.

---

## Legal notice and liability — read before installing

Provided **for personal use**, **as is**, with **no warranty** and **no guarantee** of correctness, completeness, or safety. **You are not required to use it**; install only at your own risk after reading the code (or building your own solution) and accepting that risk.

It is an **overlay / wrapper** only: it does **not** modify the portal backend. It hides much of the original UI, shows a limited modern UI, and drives the same Portál farmáře screens and dialogs you would use yourself — conceptually like someone clicking through the official portal for you; every change still goes through the real system. It is **open source** so you can **read the code**, learn from it, and preferably **build your own** or carefully customize this one after you understand and accept the risk.

**Scope** is a narrow personal use-case only: very small / family farms, **pigs and/or sheep**, basic reporting in Portál farmáře / IZR — **not** subsidy programmes, multi-farm setups, or the wider portal. If your farm, species, or obligations differ, this will likely be a poor fit.

Using the overlay can still cause real problems, for example: incorrect or incomplete data submitted to the official system; data loss if records are removed or overwritten by script-driven actions; broken or inconsistent register state if the portal UI or API changes and the script misbehaves; mistakes that look like “the portal failed” but were caused by this overlay. The author **accepts no responsibility** for any damage, data loss, administrative consequences, fines, or other problems from installing, customizing, or using this software.

Development is largely **AI-assisted “vibe-coding”**: the author understands the stack and could build the same kind of overlay by hand, but for time saving and because this is a **personal, non-commercial** tool (not a production product), the implementation is **fully generated**. The author has **not read every line** and **cannot guarantee** that it is safe, correct, audited, or production-ready — review what you install (or write your own) before trusting it with live Portál farmáře data.

This project does **not** provide legal advice and does **not** tell you how you *must* use Portál farmáře or what data to enter. For rules and guidance, use **official sources** from the Ministry of Agriculture and other competent authorities. What you see here is only the author’s interpretation for one personal use-case and may be far from what you need.

Any **example** registration numbers, ear-mark (`ušní známka`) values, partner IDs, stable labels, or similar identifiers in this repository — including placeholders and comments in [`portal-farmare.user.js`](portal-farmare.user.js) and illustrations in the docs — are **fully generated for documentation and UI demonstration**. They are **not** from a live farm register, **cannot** identify or locate a real farm, stable, animal, partner, or person, and must **not** be treated as real Portál farmáře / IZR data. Any resemblance to actual identifiers is coincidental.

---

## What it does

On Portál farmáře pages under IZR, the script:

1. Optionally shows a simplified dashboard and register UI (home, sheep, pigs, history, pending changes, ear-mark orders; labels in Czech to match the portal).
2. Keeps the original portal DOM available off-screen and fills / submits the **native** dialogs and forms.
3. Lets you leave the simplified UI and use the original portal (`pf=off` / footer control; a FAB can turn it back on).

It is a single file: [`portal-farmare.user.js`](portal-farmare.user.js).

---

## License and open source

Released under the **[MIT License](LICENSE)** (Copyright © 2026 Michal Šmahel).

You may use, study, modify, and redistribute it under that license. The MIT text also states that the software is provided **without warranty**; the legal notice above adds project-specific warnings about portal data and personal use.

Repository: [github.com/ceskyDJ/portal-farmare-simplified](https://github.com/ceskyDJ/portal-farmare-simplified)

---

## How it works

| Piece | Role |
|--------|------|
| **Tampermonkey** (or compatible userscript manager) | Installs and runs the script in your browser |
| **`portal-farmare.user.js`** | Matches `https://(www.)mze.gov.cz/ssl/app/izr2far/*` and builds the overlay |
| **Portál farmáře** | Remains the real system; the script only controls its UI |

**Updates:** when a new version is published in this repository, reinstall or update the userscript from the same file (Tampermonkey’s update features apply if you install from a URL it can check). Always re-read the disclaimer and skim the diff if you care about what changed.

Technical notes for maintainers and AI agents live under [`docs/`](docs/) (especially [`docs/userscript.md`](docs/userscript.md)). This README stays oriented to human users.

---

## Installation

1. Install **[Tampermonkey](https://www.tampermonkey.net/)** in your browser.
2. Open the raw userscript from this repo:  
   [`portal-farmare.user.js` (raw)](https://raw.githubusercontent.com/ceskyDJ/portal-farmare-simplified/main/portal-farmare.user.js)  
   Tampermonkey should offer to install it. Confirm only if you accept the risks above.
3. Log in to Portál farmáře / IZR as usual and open an IZR farm page. The simplified UI should load when the script is enabled (default on).

**Toggle:** append `?pf=off` to disable the overlay, or `?pf=on` to enable it again (preference is stored in the browser).

---

## Browser support

**Supported for practical use and debugging:** Chromium-based browsers and **Firefox** (with Tampermonkey).

It may run wherever Tampermonkey (or a compatible manager) works, but **other browsers are unsupported**. The author does not have a realistic way to test or fix issues there; do not expect help for Safari, mobile browsers, etc.

---

## Contributing / customizing

Fork, read the code, and adapt it to your farm if you accept the risk. Prefer understanding the overlay behaviour before relying on it for live register changes. Agent-oriented project docs are in [`docs/`](docs/).
