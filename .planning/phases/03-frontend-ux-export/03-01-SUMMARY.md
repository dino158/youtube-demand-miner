---
phase: 03-frontend-ux-export
plan: 01
subsystem: ui
tags: [astro, tailwind, static-shell, dom-contract]

# Dependency graph
requires:
  - phase: 02-backend-pipeline
    provides: "POST /api/generate endpoint, VideoIdea/ErrorCode types (src/lib/types.ts), live-verified 200/error contract"
provides:
  - "Static Astro shell (src/pages/index.astro) with a real form, mobile-first single-column layout, and four hidden state regions with stable ids"
  - "DOM contract (element ids) that 03-02's client island (src/scripts/app.ts) queries against"
  - "Build-unblock stub src/scripts/app.ts (export {};) — placeholder only, to be overwritten by 03-02"
affects: [03-02-client-island]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "No-framework Astro client island via plain <script src=\"...\"> tag (no client:* directive)"
    - "Hidden-by-default state regions toggled by a single 'hidden' Tailwind class (display:none)"

key-files:
  created:
    - src/scripts/app.ts (placeholder stub only — export {}; — 03-02 overwrites)
  modified:
    - src/pages/index.astro

key-decisions:
  - "Build failed solely on unresolved ../scripts/app.ts import; created minimal export {} stub per plan's conditional instruction rather than skipping the build check"
  - "novalidate on the form to suppress native browser validation bubbles; minlength/required kept as semantic defense-in-depth only, real inline validation UX is JS-driven in 03-02"

patterns-established:
  - "Region toggling contract: every hidden region carries both a layout class (flex, flex-col) and the single 'hidden' token; app.ts only ever adds/removes 'hidden'"

requirements-completed: [INPUT-01, INPUT-02, UI-02, UI-03, UI-04]

# Metrics
duration: 2min
completed: 2026-07-01
---

# Phase 3 Plan 1: Static Shell Summary

**Astro static shell for index.astro — real form with min-3-char keyword input, four hidden state regions (input-error, progress, error, results) with stable ids, mobile-first single-column Tailwind layout, and a no-framework `<script>` client-island include.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-01T11:43:58Z
- **Completed:** 2026-07-01T11:45:27Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created as stub)

## Accomplishments
- Replaced the Phase 1 placeholder body of `src/pages/index.astro` with the full DOM contract: `<form id="generate-form">` containing `#keyword` (minlength=3, required, novalidate parent) and `#generate-btn`, plus `#input-error`.
- Added three additional hidden-by-default state regions after the form: `#progress` (with nested `#progress-label` and a decorative spinner, `role="status"` + `aria-live="polite"`), `#error` (`role="alert"`), and `#results` (`flex flex-col gap-4`, single column at all widths).
- Added the required `<meta name="viewport" content="width=device-width, initial-scale=1" />` for UI-04 mobile responsiveness, plus mobile-first Tailwind classes (`px-4`, `max-w-2xl mx-auto`, `flex-col sm:flex-row`).
- Added `<script src="../scripts/app.ts"></script>` as the last child of `<body>` — no `client:*` directive, per the no-framework island pattern from 03-RESEARCH.md.
- Confirmed via `npm run build` that the shell compiles cleanly under Astro 5 + Tailwind v4, and that the emitted HTML in `dist/` preserves `id="generate-form"` and `id="results"`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite index.astro as the static shell** - `4edf9d8` (feat)
2. **Task 2: Verify the shell builds and add build-unblock stub for app.ts** - `2d0cf5f` (chore)

**Plan metadata:** (pending — final docs commit follows this summary)

## Files Created/Modified
- `src/pages/index.astro` - Full static shell: form, 4 hidden state regions, viewport meta, mobile-first layout, app.ts script include
- `src/scripts/app.ts` - Placeholder stub (`export {};`) created only to unblock the production build; **03-02 must overwrite this file, not append to it**

## Decisions Made
- Created the minimal `export {};` stub for `src/scripts/app.ts` because `npm run build` failed solely on the unresolved `../scripts/app.ts` import (confirmed by running the build before creating the stub — it errored with `Could not resolve "../scripts/app.ts"`). No logic was added to the stub; it exists only to make Vite/Rollup resolve the reference.
- Kept `minlength="3"` and `required` on the `#keyword` input as defense-in-depth/semantic hints, with `novalidate` on the form itself, exactly as specified — real inline validation messaging is deferred to 03-02's JS.

## Deviations from Plan

None — plan executed exactly as written, including its explicit conditional instruction to create the `app.ts` stub only if the build failed solely on that unresolved import (which it did).

## Issues Encountered

None. The build produced one unrelated warning (`@astrojs/vercel` noting local Node 25 vs. supported Node 24) — this is a pre-existing environmental warning, out of scope for this plan, and did not affect the build's green exit or output correctness.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `src/scripts/app.ts` contains exactly `export {};` — a deliberate, plan-mandated build-unblock placeholder with zero behavior. This is not a UI-facing stub (nothing renders from it) and is fully documented here so Plan 03-02 overwrites rather than appends to it. Not a violation of this plan's goal, which only covers the static shell.

## Next Phase Readiness
- The DOM contract is locked: `#generate-form`, `#keyword`, `#generate-btn`, `#input-error`, `#progress`, `#progress-label`, `#error`, `#results` are the exact ids 03-02's `app.ts` must query via `getElementById`.
- `src/scripts/app.ts` exists as an empty module — 03-02 replaces its contents entirely with the real client island (fetch wiring, validation, progress simulation, card rendering, export/copy).
- No blockers for 03-02.

---
*Phase: 03-frontend-ux-export*
*Completed: 2026-07-01*

## Self-Check: PASSED

All claimed files and commits verified present:
- FOUND: src/pages/index.astro
- FOUND: src/scripts/app.ts
- FOUND: .planning/phases/03-frontend-ux-export/03-01-SUMMARY.md
- FOUND: 4edf9d8 (Task 1 commit)
- FOUND: 2d0cf5f (Task 2 commit)
