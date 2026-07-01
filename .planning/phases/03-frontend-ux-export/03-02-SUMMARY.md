---
phase: 03-frontend-ux-export
plan: 02
subsystem: ui
tags: [astro, typescript, vanilla-js, clipboard-api, blob-download, dom-contract]

# Dependency graph
requires:
  - phase: 03-frontend-ux-export
    provides: "Static Astro shell (index.astro) with the locked DOM contract: #generate-form, #keyword, #generate-btn, #input-error, #progress, #progress-label, #error, #results"
  - phase: 02-backend-pipeline
    provides: "POST /api/generate endpoint returning { ideas: VideoIdea[] } (200) or { error: { code, message } } (4xx/5xx), live-verified"
provides:
  - "Fully interactive client island (src/scripts/app.ts) — the entire user-facing behavior of the tool"
  - "Client-side min-3-char validation short-circuiting before any network call"
  - "In-flight Generate-button disable/re-enable lifecycle"
  - "Simulated 4-label timed progress sequence cancelled the instant fetch settles"
  - "5-error-code taxonomy + separate network-failure message, XSS-safe via textContent only"
  - "One card per idea (title, intent badge, rationale), single column"
  - "Three one-click export actions: copy single card, copy all as markdown, download all as JSON"
  - "Human-verified end-to-end flow at 375px — all five Phase 3 success criteria confirmed"
affects: [04-deploy-ops]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local type shape duplicated from src/lib/types.ts (not import type) to bulletproof against any zod bundle leakage into the client chunk"
    - "Region toggling via classList.remove/add('hidden') only — never style.display"
    - "Event delegation on #results for per-card actions (.copy-one) instead of per-card listeners"
    - "Native async Clipboard API (navigator.clipboard.writeText) with try/catch fallback message, no execCommand"
    - "Blob + URL.createObjectURL + programmatic <a download> click for client-side JSON export, with URL.revokeObjectURL cleanup"

key-files:
  created: []
  modified:
    - src/scripts/app.ts

key-decisions:
  - "Local interface VideoIdea/type Intent duplicated in app.ts rather than `import type` from lib/types.ts — build-verified zero zod leakage into the client chunk"
  - "Progress schedule holds on the final label ('Almost done...') indefinitely after 16s rather than looping or timing out client-side, since the backend can legitimately take up to and beyond the observed 69.4s in worst-case free-tier conditions"
  - "Export payload includes the keyword alongside ideas ({ keyword, ideas }) for JSON download context, even though the UI itself doesn't require it"

patterns-established:
  - "Client island is a single self-contained module with zero new npm dependencies — form wiring, progress simulation, fetch, error mapping, rendering, and export all live in one readable file"
  - "All error paths funnel through mapError() + showError() so the UI never displays a raw object, undefined, or blank state"

requirements-completed: [INPUT-01, INPUT-02, INPUT-03, UI-01, UI-02, UI-03, EXPORT-01, EXPORT-02, EXPORT-03]

# Metrics
duration: 9min
completed: 2026-07-01
---

# Phase 3 Plan 2: Client Island (app.ts) Summary

**Vanilla-TypeScript client island (343 lines) wiring the static shell to /api/generate — client-side validation, simulated 4-stage progress, 5-code error taxonomy, XSS-safe card rendering, and copy/markdown/JSON export — human-verified end-to-end at 375px, all five Phase 3 success criteria pass.**

## Performance

- **Duration:** 9 min (13:50:26 to ~13:59, including human-verify checkpoint wait)
- **Started:** 2026-07-01T13:50:26+02:00
- **Completed:** 2026-07-01T14:29:00Z (this finalization pass)
- **Tasks:** 3 (2 auto + 1 blocking human-verify checkpoint)
- **Files modified:** 1 (`src/scripts/app.ts`, overwritten from the 03-01 placeholder stub)

## Accomplishments

- Wrote the entire client-facing behavior of the tool into a single self-contained 343-line module with zero new npm dependencies.
- Form submit handler (Enter + click both route through the same handler) with client-side `trim().length < 3` short-circuit that shows an inline error and makes NO network request (INPUT-01/02).
- Generate button disabled synchronously before `await fetch` and re-enabled in a `finally` block on both success and failure paths (INPUT-03).
- Simulated, client-driven progress-label sequence (not real streaming — backend doesn't stream) that holds on its final label until the real response lands, with `clearTimeout` cancellation the instant fetch settles so no stale label ever flashes over results (UI-02).
- Five-code error taxonomy (`VALIDATION`/`NO_RESULTS`/`RATE_LIMITED`/`UPSTREAM_ERROR`/`INTERNAL`) plus a separate fetch-throw network-failure message — never a raw object, stack trace, or blank UI (UI-03).
- One XSS-safe card per idea (title, colored intent badge, rationale) built entirely via `document.createElement` + `.textContent`, zero `innerHTML` (UI-01, UI-04).
- Three one-click export actions — per-card copy, copy-all-as-markdown, and download-all-as-JSON — using only native Clipboard/Blob APIs (EXPORT-01/02/03).
- Live human verification at 375px confirmed all five Phase 3 success criteria pass (see "Human Verification Outcome" below).
- `npm run build` reconfirmed green (exit 0) at plan finalization, after the human-verify checkpoint, with no code changes since Task 2's commit.

## Task Commits

Each task was committed atomically:

1. **Task 1: app.ts core wiring — validation, progress, fetch, error taxonomy, cards** - `ead90ed` (feat)
2. **Task 2: export actions (copy-one, copy-all-markdown, download-JSON)** - `45994d3` (feat)
3. **Task 3: human verification checkpoint** - no code commit (verification-only task); mid-plan bookkeeping commit `3abf140` (docs) recorded the paused checkpoint position

**Plan metadata:** (this summary's commit follows)

_Note: Task 3 is a `checkpoint:human-verify` gate — the executor does not write code for it; it starts the dev server, presents the verification checklist, and records the verdict._

## Files Created/Modified

- `src/scripts/app.ts` - The complete client island: local `VideoIdea`/`Intent`/`ErrorCode` types, DOM element handles with null-guard, `show`/`hide` region helpers, inline validation, simulated progress with timer cancellation, error taxonomy mapping, XSS-safe card rendering with per-intent badge colors, the submit handler, and all three export actions (copy-one, copy-all-markdown, download-JSON). Overwrote the `export {};` placeholder stub created by 03-01.

## Decisions Made

- Used a local `interface VideoIdea` / `type Intent` / `type ErrorCode` in `app.ts` instead of `import type` from `src/lib/types.ts`, per the plan's bulletproofing note — confirmed via `npm run build` inspection that no runtime `zod` import leaks into the client chunk (`dist/client/_astro/index.astro_astro_type_script_index_0_lang.DT8AU7DN.js`, 4.86 kB / 2.11 kB gzip — small and zod-free).
- Progress schedule intentionally holds on `"Almost done..."` indefinitely past 16s rather than adding a client-side timeout or looping animation, since the backend has no hard client-visible SLA and the observed worst case (69.4s, see Carried-Forward Concern below) can legitimately exceed the simulated schedule.
- Export toolbar (`#copy-all`, `#download-json`) is rebuilt fresh on every `renderCards()` call as the first child of `#results`, rather than existing statically in `index.astro`, keeping 03-01's shell free of any export-specific markup.

## Human Verification Outcome

**Checkpoint verdict: APPROVED.** The user manually tested the full flow in a browser at 375px width and confirmed all five Phase 3 success criteria pass:

1. **INPUT-01/02/03** — Submitting a keyword under 3 characters (both via Enter and via clicking Generate) shows an inline error and triggers no `/api/generate` network call; the Generate button is disabled the instant a valid request starts and re-enabled when it finishes.
2. **UI-02** — During generation, the progress region shows changing step labels (not a bare spinner), and clears immediately with no stale-label flash when results or an error arrive.
3. **UI-01/UI-04** — 8–12 cards render, each with title, colored intent badge, and one-sentence rationale, in a single readable column with no horizontal scroll or clipped text at 375px.
4. **UI-03** — Failure states show a specific, human-readable message — never a raw object, stack trace, or blank UI. Live-validated: a backend `UPSTREAM_ERROR` correctly mapped to "Something went wrong generating ideas — please try again."
5. **EXPORT-01/02/03** — Copy-one, copy-all-as-markdown, and download-JSON all work with one click each, using native Clipboard and Blob APIs.

Additionally, at the API level the orchestrator directly confirmed (via the live dev server) that a successful `POST /api/generate` returned 10 valid ideas with the correct shape (`{id, title, intent, rationale}`) spanning 3 distinct intents (how-to, informational, comparison).

## Final Progress-Label Schedule (UI-02)

Set synchronously and via `setTimeout`, all timer ids tracked in `progressTimers[]` and cleared via `stopProgress()` the instant `fetch` settles:

| Offset | Label |
|--------|-------|
| 0ms (synchronous) | `Searching pages...` |
| 4000ms | `Analyzing content...` |
| 9000ms | `Generating ideas...` |
| 16000ms | `Almost done...` (final — holds indefinitely until the response lands) |

## Error-Code → User Message Map (UI-03)

| Code / condition | User-facing message |
|---|---|
| `VALIDATION` | Backend message verbatim if non-empty, else `"Please enter a valid keyword."` |
| `NO_RESULTS` | `"No results found for that keyword — try a broader or different term."` |
| `RATE_LIMITED` | `"This tool hit a free-tier rate limit — please try again in a bit."` |
| `UPSTREAM_ERROR` | `"Something went wrong generating ideas — please try again."` |
| `INTERNAL` | `"Something unexpected went wrong — please try again."` |
| unknown/unrecognized code | `"Something unexpected went wrong — please try again."` (future-proof default) |
| `fetch()` itself throws (network/offline/DNS/CORS, no HTTP response) | `"Can't reach the server — check your connection and try again."` |

## Export Formats (EXPORT-01/02/03)

**Single-card copy (EXPORT-03)** — plain text, three lines:
```
{title}
Intent: {intent}
{rationale}
```

**Copy-all markdown (EXPORT-01)** — numbered list with a keyword heading:
```
# YouTube video ideas for "{keyword}"

1. **{title}**
   - Intent: {intent}
   - {rationale}

2. **{title}**
   - Intent: {intent}
   - {rationale}
...
```

**Download JSON (EXPORT-02)** — client-side Blob download, no server round-trip:
- Payload: `{ keyword, ideas }`
- Filename pattern: `youtube-ideas-${slug}.json` where `slug` is the keyword lowercased, non-alphanumeric runs collapsed to single hyphens, leading/trailing hyphens stripped (`keyword.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`); falls back to `youtube-ideas.json` if the slug is empty.

## Deviations from Plan

None — plan executed exactly as written across both automated tasks. The human-verify checkpoint (Task 3) returned "approved" with no follow-up gap-closure required.

## Issues Encountered

None during Tasks 1–2. No auto-fixes were needed (no Rule 1/2/3 triggers) — the plan's interface contracts (DOM ids, backend error envelope, VideoIdea shape) matched the live code exactly as documented in 03-01-SUMMARY.md and the Phase 2 backend.

## Carried-Forward Concern (Out of Phase 3 Scope — Flag for Phase 4)

During live human verification, the backend's Gemini 2.5 Flash free-tier responses were observed to be **transiently flaky** (intermittent 5xx from the provider, surfaced to the client as `UPSTREAM_ERROR` after the backend's internal retry-once) and **slow** — one observed successful generation took **69.4 seconds** end-to-end.

This matters because:
- The current `vercel.json` / adapter `maxDuration` is configured at **60 seconds** (see PROJECT.md Key Decisions and Phase 1 scaffold).
- A 69.4s generation **exceeds** that ceiling — in a real Vercel deployment (not local `npm run dev`, which has no such limit), a similarly slow generation would be killed by the platform timeout and surface as a raw 504 / network failure to the user, not a clean `UPSTREAM_ERROR`.
- This is **not a Phase 3 frontend defect** — the frontend correctly displays whatever error the backend/platform produces, including the "Can't reach the server" fallback if the connection is cut mid-request. The root cause is backend/provider latency variance under Phase 2, and platform timeout configuration under Phase 4 deploy.

**Recommendation for Phase 4 (Deploy & Ops):** before or during deployment, mitigate this via one or more of:
1. Raise `maxDuration` toward the Vercel Hobby-tier ceiling (currently 300s on Hobby for Fluid Compute / up to plan limits) to give slow generations more headroom.
2. Add a provider fallback (e.g., Groq, per the v2 `IDEAS-V2-03` idea already noted in REQUIREMENTS.md) so a stalled Gemini call can fail over rather than exhaust the full timeout.
3. Increase or tune the backend's retry budget/backoff so transient 5xx from the free-tier provider resolves faster rather than compounding latency.

This concern is recorded here and in STATE.md Blockers/Concerns so it is visible when Phase 4 planning begins; no code change was made in this plan to address it, per the instruction to keep it out of Phase 3 scope.

## User Setup Required

None — no external service configuration required for this plan.

## Known Stubs

None. All rendered UI paths (validation, progress, cards, errors, exports) are wired to real data sources (live fetch response or user-triggered client-side actions). No hardcoded empty values, placeholder text, or unwired mock data exist in `src/scripts/app.ts`.

## Next Phase Readiness

- Phase 3 is now fully complete: both `03-01-PLAN.md` (static shell) and `03-02-PLAN.md` (client island) are done, and all five Phase 3 success criteria are human-verified at 375px.
- All Phase 3 requirements (INPUT-01/02/03, UI-01/02/03/04, EXPORT-01/02/03) are satisfied.
- Phase 4 (Deploy & Ops) can begin. Before or during Phase 4 planning, address the carried-forward latency/flakiness concern above — it directly affects `DEPLOY-04` ("end-to-end keyword → rendered idea list completes in under 25 seconds") and the `maxDuration: 60` assumption baked into the Phase 1 scaffold.
- No other blockers.

---
*Phase: 03-frontend-ux-export*
*Completed: 2026-07-01*

## Self-Check: PASSED

All claimed files, commits, and content markers verified present:
- FOUND: src/scripts/app.ts (343 lines)
- FOUND: src/pages/index.astro
- FOUND: .planning/phases/03-frontend-ux-export/03-02-PLAN.md
- FOUND: ead90ed (Task 1 commit)
- FOUND: 45994d3 (Task 2 commit)
- FOUND: 3abf140 (mid-plan checkpoint bookkeeping commit)
- FOUND: navigator.clipboard.writeText
- FOUND: URL.createObjectURL
- FOUND: URL.revokeObjectURL
- CONFIRMED: zero innerHTML (XSS-safe, textContent-only rendering)
- CONFIRMED: `npm run build` exits 0 (re-run at finalization)
