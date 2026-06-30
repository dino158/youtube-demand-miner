---
phase: 02-backend-pipeline
plan: 01
subsystem: api
tags: [vercel-ai-sdk, gemini, anthropic-haiku, firecrawl, zod, generateObject, astro-env]

# Dependency graph
requires:
  - phase: 01-scaffold-security
    provides: "astro:env/server schema (FIRECRAWL_API_KEY, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY, LLM_PROVIDER), Astro 5 + Vercel adapter, gitleaks hook"
provides:
  - "VideoIdea type + Zod schemas (VideoIdeaLLMSchema, VideoIdeaSchema, VideoIdeaListSchema), Intent enum, ErrorCode union — the cross-phase contract Phase 3 consumes"
  - "AppError class + toErrorResponse() — the single { error: { code, message } } envelope with D-05 status mapping"
  - "searchFirecrawl(keyword) — /v2/search demand fetcher (10 web results, no scrapeOptions)"
  - "buildDemandContext(results) — ~8k-token-capped demand-context string"
  - "getModel() — env-keyed LLM provider factory (Gemini default, Haiku swap-in)"
  - "generateIdeas(demandContext, keyword) — count-enforced VideoIdea[] generator"
affects: [02-02-orchestrator, 03-frontend, phase-3-ui, phase-4-deploy]

# Tech tracking
tech-stack:
  added: [ai@7.0.9, "@ai-sdk/google@4.0.3", "@ai-sdk/anthropic@4.0.4", zod@4.4.3, "@astrojs/check@0.9.9", typescript@5.9.3, "@types/node@26.0.1"]
  patterns: [provider-factory-keyed-on-env, unconstrained-llm-schema-plus-code-level-count-enforcement, single-error-envelope-helper, raw-fetch-over-sdk, chars-per-4-token-cap, status-code-only-error-branching]

key-files:
  created:
    - src/lib/types.ts
    - src/lib/errors.ts
    - src/lib/firecrawl.ts
    - src/lib/demand-parser.ts
    - src/lib/llm-provider.ts
    - src/lib/generate-ideas.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "LLM-facing schema (VideoIdeaLLMSchema) is unconstrained on array length; the 8-12 rule is enforced in code (trim>12, retry<8) per vercel/ai#9202 — minItems/maxItems are not reliably honored by models"
  - "Provider factory uses explicit-apiKey factory functions (createGoogleGenerativeAI/createAnthropic) not bare singletons — the bare google singleton reads GOOGLE_GENERATIVE_AI_API_KEY (wrong name for this project)"
  - "Firecrawl errors branch on HTTP status code only (429->RATE_LIMITED, 5xx/other->UPSTREAM_ERROR), never on response-body message parsing"
  - "Haiku model ID is claude-haiku-4-5 (current), not the stale claude-3-haiku-20240307"
  - "Raw fetch to /v2/search instead of @mendable/firecrawl-js (SDK pulls axios + a second bundled zod copy for one endpoint)"

patterns-established:
  - "Provider factory keyed on env var: getModel() returns the right LanguageModel from LLM_PROVIDER — zero code change to swap providers"
  - "Single error envelope: one AppError class + one toErrorResponse() produce the { error: { code, message } } shape everywhere"
  - "Unconstrained LLM schema + post-call code-level count enforcement: never put .min/.max on the schema sent to generateObject"

requirements-completed: [DEMAND-01, DEMAND-02, IDEAS-01, IDEAS-02, IDEAS-03, IDEAS-04, IDEAS-05, IDEAS-06]

# Metrics
duration: 4min
completed: 2026-07-01
---

# Phase 2 Plan 1: Backend Pipeline Foundation Summary

**Six typed `src/lib` modules — the VideoIdea/ErrorCode cross-phase contract, a single error envelope, a credit-preserving Firecrawl `/v2/search` fetcher, an ~8k-token demand parser, an env-keyed Gemini/Haiku provider factory, and a count-enforced `generateObject` idea generator.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-30T23:07:43Z
- **Completed:** 2026-06-30T23:11:00Z
- **Tasks:** 3
- **Files modified:** 8 (6 created lib modules + package.json/package-lock.json)

## Accomplishments

- **Cross-phase contract defined** (`types.ts`): `VideoIdea` type, `Intent` 4-value enum (`informational | how-to | commercial | comparison`), `ErrorCode` union (`VALIDATION | NO_RESULTS | RATE_LIMITED | UPSTREAM_ERROR | INTERNAL`), plus three Zod schemas — `VideoIdeaLLMSchema` (unconstrained, for the LLM), `VideoIdeaSchema` (adds stable `id`), `VideoIdeaListSchema` (`.min(8)` final gate). This is exactly what the Plan 02-02 orchestrator and Phase 3 frontend import.
- **Single error envelope** (`errors.ts`): one `AppError` class + one `toErrorResponse()` that maps codes to D-05 statuses (400/422/429/503/500) and emits the `{ error: { code, message } }` shape in exactly one place; non-`AppError` falls through to `INTERNAL` with a generic message (no internal-message leak).
- **Credit-preserving Firecrawl fetcher** (`firecrawl.ts`): single raw `fetch` POST to `/v2/search` with `limit: 10`, `sources: [{ type: 'web' }]`, and **no `scrapeOptions` key at all** (D-01/D-03); errors branch on HTTP status code only.
- **Token-capping demand parser** (`demand-parser.ts`): `buildDemandContext` assembles numbered title+snippet lines, capped at ~8,000 tokens via the chars/4 heuristic (32,000-char ceiling) — no tokenizer dependency.
- **Env-keyed provider factory** (`llm-provider.ts`): `getModel()` returns Gemini 2.5 Flash by default and Haiku (`claude-haiku-4-5`) when `LLM_PROVIDER=haiku`, using explicit-apiKey factory functions so the swap is a pure env-var flip.
- **Count-enforced idea generator** (`generate-ideas.ts`): `generateObject` with the unconstrained schema, then D-07 enforcement in code (trim >12 to 12, retry once if <8, throw `UPSTREAM_ERROR` if still short); 429 never retries, transient errors retry once, malformed output (`NoObjectGeneratedError`) maps to `UPSTREAM_ERROR`; `randomUUID` ids attached; final `VideoIdeaListSchema.parse` gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install AI SDK packages + define shared types and error envelope** - `38ab5e4` (feat)
2. **Task 2: Firecrawl /search demand fetcher + token-capping demand parser** - `c3ded54` (feat)
3. **Task 3: Env-keyed LLM provider factory + idea generator with D-07 count enforcement** - `73db027` (feat)

**Plan metadata:** (docs: complete plan — see final commit)

## Files Created/Modified

- `src/lib/types.ts` - VideoIdea contract: IntentEnum, VideoIdeaLLMSchema (unconstrained), VideoIdeaSchema (+id), VideoIdeaListSchema (.min 8), ErrorCode union
- `src/lib/errors.ts` - AppError class + toErrorResponse() with D-05 status map (single envelope source)
- `src/lib/firecrawl.ts` - searchFirecrawl() -> /v2/search, 10 web results, no scrapeOptions, status-code-only error branching
- `src/lib/demand-parser.ts` - buildDemandContext() -> ~8k-token-capped numbered demand string
- `src/lib/llm-provider.ts` - getModel() -> Gemini default / Haiku on LLM_PROVIDER, explicit-apiKey factories
- `src/lib/generate-ideas.ts` - generateIdeas() -> generateObject + D-07 count enforcement + error classification
- `package.json` / `package-lock.json` - added ai, @ai-sdk/google, @ai-sdk/anthropic, zod (deps); @astrojs/check, typescript, @types/node (devDeps)

## Exported Contract (for Plan 02-02 + Phase 3)

```typescript
// from src/lib/types.ts
type Intent = 'informational' | 'how-to' | 'commercial' | 'comparison';
type VideoIdea = { title: string; intent: Intent; rationale: string; id: string };
type ErrorCode = 'VALIDATION' | 'NO_RESULTS' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INTERNAL';
const VideoIdeaListSchema; // z.array(VideoIdeaSchema).min(8)

// from src/lib/errors.ts
class AppError extends Error { code: ErrorCode; }
function toErrorResponse(err: unknown): Response; // { error: { code, message } } + status

// from src/lib/firecrawl.ts
interface FirecrawlWebResult { title: string; description: string; url: string }
function searchFirecrawl(keyword: string): Promise<FirecrawlWebResult[]>;

// from src/lib/demand-parser.ts
function buildDemandContext(results: FirecrawlWebResult[]): string;

// from src/lib/llm-provider.ts
function getModel(): LanguageModel;

// from src/lib/generate-ideas.ts
function generateIdeas(demandContext: string, keyword: string): Promise<VideoIdea[]>;
```

**Success response shape (D-04):** `{ ideas: VideoIdea[] }`. **Error shape (D-04):** `{ error: { code, message } }`.

## Package Versions Installed

| Package | Version | Role |
|---------|---------|------|
| `ai` | 7.0.9 | Vercel AI SDK core — generateObject, NoObjectGeneratedError, APICallError |
| `@ai-sdk/google` | 4.0.3 | Gemini provider (default $0) |
| `@ai-sdk/anthropic` | 4.0.4 | Haiku swap-in provider |
| `zod` | 4.4.3 | Schema validation (deduped across all AI SDK packages) |
| `@astrojs/check` (dev) | 0.9.9 | type verification (`npx astro check`) |
| `typescript` (dev) | 5.9.3 | required by @astrojs/check |
| `@types/node` (dev) | 26.0.1 | Node built-in module types (node:crypto) |

All four core versions match the research-verified targets exactly.

## Decisions Made

- Extracted the duplicated `generateObject` call in `generate-ideas.ts` into a private `generateOnce()` helper (DRY) — the plan explicitly permits this ("Keep the two generateObject calls DRY if you prefer — extract an inner helper"). The behavior contract (429 never retries, transient retries once, under-8 retries the whole call once, over-12 trims silently, final parse enforces the floor) is preserved.
- Confirmed the Firecrawl endpoint as `https://api.firecrawl.dev/v2/search` and response shape `json.data.web` per current docs (research-verified 2026-07-01). Kept as a single named constant (`FIRECRAWL_SEARCH_URL`) so a version bump is a one-line change. Not exercised against a live key in this plan — verification against a real key is a Plan 02-02 / Phase 4 concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @astrojs/check + typescript devDependencies**
- **Found during:** Task 1 (running the plan's `<verify>` step)
- **Issue:** The plan's verification command `npx astro check` requires `@astrojs/check` and `typescript`, which were not installed (the project had no TypeScript tooling). The check prompted interactively and could not run.
- **Fix:** `npm i -D @astrojs/check typescript` (non-interactive).
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx astro check` runs and reports 0 errors.
- **Committed in:** 38ab5e4 (Task 1 commit)

**2. [Rule 3 - Blocking] Installed @types/node devDependency**
- **Found during:** Task 3 (idea generator implementation)
- **Issue:** `import { randomUUID } from 'node:crypto'` (specified by the plan) failed type resolution — `astro check` reported `ts(2307): Cannot find module 'node:crypto'` because `@types/node` was absent.
- **Fix:** `npm i -D @types/node`.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx astro check` drops from 1 error to 0 errors.
- **Committed in:** 73db027 (Task 3 commit)

**3. [Rule 1 - Bug] Rephrased a comment in firecrawl.ts to satisfy the credit-budget grep guard**
- **Found during:** Task 2 (Firecrawl fetcher)
- **Issue:** The plan's literal example comment `// NO scrapeOptions: ...` contains the string `scrapeOptions`, which made the success-criterion guard `grep -c scrapeOptions src/lib/firecrawl.ts` return 1 instead of the required 0.
- **Fix:** Rephrased the comment to convey the same intent ("page-content-fetch / JSON-extraction / stealth-proxy options are intentionally OMITTED") without the literal token. The request body still has no `scrapeOptions` key.
- **Files modified:** src/lib/firecrawl.ts
- **Verification:** `grep -c scrapeOptions src/lib/firecrawl.ts` returns 0; behavior unchanged.
- **Committed in:** c3ded54 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking dependency installs, 1 bug — guard-satisfying comment fix)
**Impact on plan:** All three were necessary to make the plan's own verification commands pass. The two dependency installs are required tooling/types; the comment fix preserves behavior while satisfying success criterion #4. No scope creep, no contract change.

## Issues Encountered

- `ai@7.0.9`'s `generateObject` typing carries a TypeScript "deprecated" hint (ts(6385)/ts(6387)). Per the research (which inspected the installed `.d.ts` directly), `generateObject` remains a live, fully-typed, first-class export; the hint reflects an SDK signature-evolution note, not a real removal. It surfaces as a `hint` (not an error or warning) in `astro check`, so the "0 errors" success criterion is met. No action taken — the plan mandates `generateObject`.
- The Phase 1 `src/pages/api/generate.ts` stub emits a pre-existing `request` unused-variable hint. Out of scope (not caused by this plan); Plan 02-02 wires `request` into the orchestrator.

## Known Stubs

None — all six modules are fully implemented and wired to their real data sources/contracts. The only "unwired" code is the Phase 1 `generate.ts` stub, which is explicitly Plan 02-02's responsibility.

## User Setup Required

None for this plan — no external service was called or configured. Runtime API keys (`FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`) are already declared (optional) in `astro:env` from Phase 1 and are configured for real in Phase 4 (Vercel project env). The modules guard for missing keys and throw a clear `INTERNAL` error.

## Next Phase Readiness

- **Ready for Plan 02-02 (orchestrator):** all six units exist and typecheck. The orchestrator only needs to validate the request (`z.string().trim().min(3)`), call `searchFirecrawl` -> check `length === 0` -> throw `NO_RESULTS`, call `buildDemandContext` -> `generateIdeas`, return `{ ideas }`, and wrap the whole thing in `try/catch` -> `toErrorResponse`.
- **Ready for Phase 3 (frontend):** the `VideoIdea` type and `ErrorCode` union are the stable contract; the success/error envelopes (`{ ideas }` / `{ error: { code, message } }`) are fixed.
- **Concern (carried forward):** the Firecrawl `/v2/search` endpoint and `data.web` response shape are research-verified against docs but not yet exercised with a live key — confirm during Plan 02-02 curl testing / Phase 4 deploy. The single `FIRECRAWL_SEARCH_URL` constant makes a correction a one-line change.

## Self-Check: PASSED

All 6 lib modules + SUMMARY.md exist on disk; all 3 task commits (38ab5e4, c3ded54, 73db027) present in git history; `npx astro check` reports 0 errors.

---
*Phase: 02-backend-pipeline*
*Completed: 2026-07-01*
