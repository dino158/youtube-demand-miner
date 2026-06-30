---
phase: 02-backend-pipeline
plan: 02
subsystem: api
tags: [astro-api-route, orchestrator, zod-validation, firecrawl, gemini, error-envelope, curl-verified]

# Dependency graph
requires:
  - phase: 02-backend-pipeline
    plan: 01
    provides: "VideoIdea/ErrorCode contract, AppError + toErrorResponse envelope, searchFirecrawl, buildDemandContext, getModel, generateIdeas"
  - phase: 01-scaffold-security
    provides: "astro:env server schema (FIRECRAWL_API_KEY, GOOGLE_AI_API_KEY, LLM_PROVIDER), Astro 5 + Vercel adapter, prerender=false API route"
provides:
  - "POST /api/generate — the live keyword -> demand-grounded-ideas endpoint (Zod validate -> Firecrawl retry-once -> NO_RESULTS guard -> demand context -> generateIdeas -> { ideas } | { error: { code, message } })"
  - "Live-verified error taxonomy: VALIDATION->400 (before any network call), and the full D-05 status map wired through toErrorResponse"
  - "Live-confirmed Firecrawl /v2/search + Gemini happy path: real keyword returns 8-12 grounded VideoIdea objects in ~13s"
affects: [03-frontend, phase-3-ui, phase-4-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns: [validate-before-network, retry-once-on-transient-not-rate-limit, single-outer-trycatch-to-error-envelope, no-results-guard-before-llm-spend]

key-files:
  created:
    - .planning/phases/02-backend-pipeline/02-02-SUMMARY.md
  modified:
    - src/pages/api/generate.ts

key-decisions:
  - "Endpoint deliverable verified against LIVE keys (not just docs): Firecrawl /v2/search + data.web shape and Gemini 2.5 Flash both confirmed working end-to-end — closes the carried-forward concern from Plan 02-01"
  - "LLM returned 9 ideas for 'drone photography' — inside the 8-12 band with zero code-level trim/retry needed; the count-enforcement layer (D-07) was present but not exercised on this run"
  - "Validation short-circuits in 1-4ms (no network call) for empty/short/missing/non-JSON bodies — confirmed in dev-server timing log, proving success criterion #5"

requirements-completed: [DEMAND-01, DEMAND-02, IDEAS-01, IDEAS-05]

# Metrics
duration: 1min
completed: 2026-07-01
---

# Phase 2 Plan 2: /api/generate Orchestrator Summary

**The phase deliverable is live: `POST /api/generate` validates the keyword with Zod before any network call, fetches the Google demand signal from Firecrawl (`/v2/search`, retry-once on transient), guards NO_RESULTS, builds the token-capped context, and synthesizes 8-12 grounded YouTube video ideas via Gemini — verified end-to-end with curl against real API keys (200 in ~13s, plus the full 400 validation taxonomy).**

## Performance

- **Duration:** ~1 min (continuation run: verification only)
- **Tasks:** 2 (Task 1 wired in the prior run; Task 2 verified here)
- **Files modified:** 1 (`src/pages/api/generate.ts`, in Task 1)
- **Happy-path latency observed:** 13.0s end-to-end (well under the 60s ceiling, near the ~20s target)

## Accomplishments

- **`POST /api/generate` is the live cross-phase contract** — wired in Task 1 (`7784521`): `prerender = false` first line, imports resolve at `../../lib`, single outer try/catch delegates to `toErrorResponse`, Firecrawl retry-once helper never retries RATE_LIMITED.
- **Full validation taxonomy verified live (HTTP 400, VALIDATION envelope, sub-5ms, no network call):**
  - `{"keyword":""}` -> `400 {"error":{"code":"VALIDATION","message":"Keyword must be at least 3 characters"}}`
  - `{"keyword":"ab"}` -> `400 {"error":{"code":"VALIDATION","message":"Keyword must be at least 3 characters"}}`
  - `{}` (missing) -> `400 {"error":{"code":"VALIDATION","message":"Invalid input: expected string, received undefined"}}`
  - non-JSON body -> `400 {"error":{"code":"VALIDATION","message":"Invalid input: expected object, received null"}}`
- **Happy path verified live with real keys** — `{"keyword":"drone photography"}` -> **HTTP 200 in 13.0s**, `{ ideas: [...] }` with **9 objects** (inside the 8-12 band), every object carrying valid `id` (UUID), `title`, `intent` (from the 4-value enum), and `rationale`. Intent distribution: 6 how-to, 3 informational. All titles on-topic and demand-grounded.
- **Firecrawl `/v2/search` + `data.web` response shape confirmed against a live key** — closes the concern carried forward from Plan 02-01 (previously research-verified against docs only). The full Firecrawl -> demand-parser -> Gemini leg ran clean with no errors in the dev-server log.

### Real happy-path output (sample titles, all 9 captured)

```
1. [how-to]        Drone Photography For Beginners: Your ULTIMATE 2024 Guide!
2. [how-to]        Master Real Estate Drone Photography: Boost Your Listings & Business!
3. [how-to]        Drone Camera Settings Explained: Shoot Like a Pro in Any Light!
4. [how-to]        Drone Landscape Photography: Capture Breathtaking Aerial Views Every Time
5. [informational] How Much Does Drone Photography Cost? (Pricing Guide for Services & Gear)
6. [how-to]        Drone Photo Editing Tutorial: Transform Your Aerials from Bland to Grand!
7. [informational] Drone Photography Laws & Regulations: Stay Legal While Flying!
8. [informational] Essential Drone Photography Gear for Beginners (Beyond the Drone Itself!)
9. [how-to]        Top 5 Drone Photography Mistakes (And How To Fix Them!)
```

First idea object (full shape):

```json
{
  "title": "Drone Photography For Beginners: Your ULTIMATE 2024 Guide!",
  "intent": "how-to",
  "rationale": "This video directly addresses the highest volume of search intent for new users, providing a comprehensive starting point for an aspiring drone photographer.",
  "id": "e8b75254-b438-4b7e-b817-b9e8eecac1ec"
}
```

## Task Commits

1. **Task 1: Wire the orchestrator in `src/pages/api/generate.ts`** - `7784521` (feat) — committed in the prior executor run; verified present and that the file is the real orchestrator (not the Phase 1 stub). Not recommitted.
2. **Task 2: Verify the `/api/generate` contract end-to-end with curl** - no code change (verification-only checkpoint). Result: PASS — recorded above.

**Plan metadata:** see final docs commit.

## Files Created/Modified

- `src/pages/api/generate.ts` (modified in Task 1) — Zod `RequestSchema` (`.trim().min(3)`), `fetchWithRetry` (retry-once on transient/`TypeError`, never on `RATE_LIMITED`), `NO_RESULTS` guard, `buildDemandContext` -> `generateIdeas`, success `{ ideas }`, single `catch` -> `toErrorResponse(err)`.

## Verification Evidence

| Case | Input | Expected | Observed | Pass |
|------|-------|----------|----------|------|
| Empty keyword | `{"keyword":""}` | 400 VALIDATION | 400, VALIDATION, "Keyword must be at least 3 characters", 4ms | YES |
| Under-3-char | `{"keyword":"ab"}` | 400 VALIDATION | 400, VALIDATION, same message, 1ms | YES |
| Missing keyword | `{}` | 400 VALIDATION | 400, VALIDATION, "expected string, received undefined", 1ms | YES |
| Non-JSON body | `not json` | 400 VALIDATION | 400, VALIDATION, "expected object, received null", 1ms | YES |
| Happy path | `{"keyword":"drone photography"}` | 200, 8-12 ideas | 200, 9 ideas, all fields valid, 13.0s | YES |

Dev-server access log corroborated the curl timings: four `[400] POST /api/generate` at 1-4ms each (confirming validation short-circuits before any network call), one `[200] POST /api/generate 12968ms`. No errors/warnings logged during the Firecrawl + Gemini leg.

## Decisions Made

- **Verified against live keys, not docs.** The `.env` (gitignored) supplied real `FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, and `LLM_PROVIDER=gemini`. This run exercised the actual Firecrawl `/v2/search` endpoint and `data.web` parsing for the first time, plus Gemini 2.5 Flash — both confirmed correct, closing Plan 02-01's carried-forward concern.
- **9 ideas, no count-enforcement triggered.** The model returned a value inside the 8-12 band on the first call, so the D-07 trim(>12)/retry(<8) logic was present but not exercised. The 8-12 contract held on the natural output.
- **Haiku provider swap NOT tested this run.** The optional `LLM_PROVIDER=haiku` cross-check (success criterion #2) was left for the user / Phase 4 — `LLM_PROVIDER=gemini` was the configured default and the env-keyed factory pattern is already proven by Plan 02-01's design. No code change is needed for the swap.

## Deviations from Plan

None — Task 1 was wired exactly as the plan specified (prior run), and Task 2 was a verification checkpoint that passed on the real happy path. The credential gate raised at the original checkpoint was resolved by the user supplying real keys in `.env`; this is normal checkpoint flow, not a deviation.

## Authentication / Credential Gates

- **Credential gate (resolved):** the original executor paused at the Task 2 human-verify checkpoint because the happy path required real `FIRECRAWL_API_KEY` + `GOOGLE_AI_API_KEY`. The user provisioned a gitignored `.env` with both keys plus `LLM_PROVIDER=gemini` and replied "approved". This continuation run then executed the real happy-path curl successfully. `.env` was never committed and remains gitignored.

## Known Stubs

None — the orchestrator is fully wired to its real data sources (Firecrawl + Gemini) and verified end-to-end against live keys. The complete keyword-in -> demand-grounded-ideas-out flow works.

## Next Phase Readiness

- **Ready for Phase 3 (frontend):** `POST /api/generate` is live and contract-stable. The success envelope `{ ideas: VideoIdea[] }` and the error envelope `{ error: { code, message } }` (D-05 status map) are confirmed in production-shaped responses. The frontend can build against these exact shapes.
- **Ready for Phase 4 (deploy):** the pipeline runs clean locally with the gitignored `.env`; Phase 4 supplies the same keys as Vercel serverless env vars. The `@astrojs/vercel` single-`_render.func` concern (logged Phase 1) is the only open deploy item.
- **Optional follow-up:** confirm `LLM_PROVIDER=haiku` swap (success criterion #2) if an Anthropic key is available — no code change required.

## Self-Check: PASSED

- `.planning/phases/02-backend-pipeline/02-02-SUMMARY.md` exists on disk.
- `src/pages/api/generate.ts` exists and is the wired orchestrator (contains `searchFirecrawl` + `toErrorResponse(err)`, not the Phase 1 stub).
- Task 1 commit `7784521` confirmed present in git history (not redone).
- All curl evidence in this SUMMARY is real captured output (HTTP 200, 9 ideas, 13.0s latency; full 400 validation taxonomy), corroborated by the dev-server access log.

---
*Phase: 02-backend-pipeline*
*Completed: 2026-07-01*
