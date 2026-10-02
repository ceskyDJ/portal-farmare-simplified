# Agent instructions

## Behavior

- Think before coding: state assumptions; ask if unclear; surface tradeoffs.
- Simplicity first: minimum code; no speculative features or abstractions (YAGNI/KISS).
- Surgical changes: only what the task requires; no drive-by refactors.
- Goal-driven: define verifiable done criteria; loop until checks pass.
- Prefer reuse (DRY) over parallel implementations; ask before new dependencies.
- For trivial tasks (typo, one-line fix), skip heavy planning—still verify the change.
- Plans stay compact: no duplicated points; do not omit important points; do not overengineer.
- Do not put Mermaid diagrams in plans.

## Tools

- Prefer **Cursor built-in tools** (Read, Grep, Glob, edits, …) and a little reasoning when that is enough.
- Do **not** reach for ad-hoc shell/Python scripts for jobs the built-ins already cover.
- Shell is fine for real project commands (verify, git, package manager, project scripts) — not as a substitute for reading/searching/editing via built-ins.
- Be conservative: no redundant verify vs pre-commit/hooks; no parallel validate pipelines.

### Questions for the user

- Research first. Ask only when blocked on a decision, clarification, approval, credential, or other input that belongs to the user.
- `AskQuestion` is the **only** allowed way to ask. Never ask in prose, a Markdown question block, a list, commentary, or the final response.
- Ask exactly one unresolved question per turn. Put the safest sensible recommendation first and explain it in one line.
- After asking, run `.cursor/bin/banner help` as the final tool call and wait.

## Plans

Store durable plans under **[`.cursor/plans/`](.cursor/plans/)**. Do not leave them only in chat. Keep plans concise and actionable; update the same file when the plan changes. Skip a written plan for trivial one-line work.

### Interview before planning

Interview when scope is unclear or approaches have material tradeoffs; touching several files alone is not a reason. Research facts first; ask only for decisions or intent. Trivial one-line work: skip interview and skip a written plan.

1. Ask exactly one unresolved question per turn; recommend an answer and give one-line reasoning (via `AskQuestion`; see Questions for the user).
2. End every waiting turn with `.cursor/bin/banner help`.
3. If several decisions are known, track a short numbered backlog in `.cursor/tmp/plan-questions.md`; never dump it on the user or commit it.
4. After each answer, remove items already resolved in substance and add newly exposed blockers.
5. Call `CreatePlan` only after scope, approach, and blocking tradeoffs are settled; the plan must contain no unresolved A/B choices.

## Boundaries

- Never commit secrets (`.env`, keys, tokens, credentials).
- No package manager — single Tampermonkey userscript (`portal-farmare.user.js`). Do not introduce npm/pnpm/yarn without asking.
- Ask before adding any dependency or package-manager tooling. Prefer no new deps.
- Use only browser-agnostic JavaScript that works in Chromium and Firefox; avoid engine-specific APIs.
- Always bump `@version` per semantic versioning after behavioral/API changes.
- Never include personal or stable-specific data (owner names, animal counts, IDs, etc.) from sources or live data in the script, commits, or docs.
- Prefer release stability: avoid changes that break the Tampermonkey script across routine releases.
- Remove temporary debug as soon as the issue is fixed or the needed observation is captured.

## Verify

- Syntax: `node --check portal-farmare.user.js` before claiming done.
- Confirm userscript header remains valid Tampermonkey (`==UserScript==` metadata, `@match`/`@grant`, etc.).
- Review changed code for Chromium + Firefox compatibility (no engine-only APIs).
- Report command + outcome before claiming done.
- For userscript changes: keep the script working across Chromium and Firefox; strip temporary debug before claiming done; bump `@version` per semver.
- After any behavioral/structural userscript change, update `docs/userscript.md` in the same task so it stays 1:1 with the code.

## Workflow

- **Commit regularly:** after each coherent finished task, create meaningful human-readable commits. Split loosely related changes into separate commits; do not batch unrelated work into one.
- **Conventional Commits:** `type(scope): Subject` — imperative, first word capitalized, no trailing period (e.g. `fix(auth): Retry expired session tokens`).
- **Branches:** `ceskydj/<branch-name>`. Before create/switch, prefix bare names with `ceskydj/`. Do not rename a published branch unless asked.
- Do not amend, force-push, or push unless the user explicitly asks (or extra norms below allow it).
- Never GPG-sign commits (agent is not allowed to sign).
- Amending / fixup / similar history edits of already-signed commits are allowed when needed.
- Never push — the user signs and pushes.
- Stop and ask before product decisions or larger/behavioral changes that could destabilize the userscript; prefer small, stable increments.
- Never guess missing DOM structure, attributes, or API payloads; if `sources/` lacks the example, ask the user for a real capture.

## Living docs (read when applicable)

- `.cursor/memory/incidents.md` — append after resolving a non-trivial problem (`When` / `Core` / `Symptoms` / `Resolution`). Append-only: never edit older records; remove only when no longer relevant; skip trivial one-liners.
- `.cursor/memory/guides.md` — when adding/using a complex procedure (deploy, quality routine, etc.). Append-only: never edit; to change a guide, remove the old entry and add a new one; never merge/average with a dropped entry into a more generalized guide.
- `docs/userscript.md` — read before non-trivial userscript work (how/why, decisions, structure). Update it whenever code behavior or structure changes so it stays 1:1; skip for pure typos.
- `sources/` — HAR/HTML/exports of IZR UI/API; open when implementing parsers/selectors. If needed DOM/API evidence is missing, ask for a real example — never invent. Skip for pure typo/semver bumps.
- `sources/` HAR/HTML may contain personal/stable data — never copy those values into the userscript, commits, or shared docs.

## End-of-turn banner

Use only the exact output from `.cursor/bin/banner` in the current turn; never draw, recall, or substitute the art.

1. Finish every other tool call first.
2. As the standalone final tool call, run `.cursor/bin/banner done` for a finished job or `.cursor/bin/banner help` whenever waiting for user input. Do not combine, pipe, or transform it.
3. Copy complete stdout byte-for-byte into an `ansi` fenced block. Add only the fences; keep real ESC bytes unchanged.
4. Put nothing after the closing fence.

No banner for a mid-task update followed by more work, or a pure acknowledgement with no deliverable or question.

## Cursor

- Keep this file short (always-on context). Put path-specific depth in `.cursor/rules/*.mdc` and multi-step procedures in skills.
- Prefer references with when/why over pasting large docs here.
