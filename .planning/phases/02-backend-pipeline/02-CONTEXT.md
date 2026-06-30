# Phase 2: Backend Pipeline - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the server-side pipeline behind `POST /api/generate`: Firecrawl `/search` fetch → demand parser → swappable LLM provider strategy → Zod-validated `{ ideas: VideoIdea[] }`. The endpoint accepts `{ keyword }` and must be verifiable with `curl` against a Vercel preview deployment.

**Out of scope for this phase:** the frontend/UI and export actions (Phase 3), and the production deploy + README + perf verification (Phase 4). No auth or rate-limiting guard (decided at project level).

</domain>

<decisions>
## Implementation Decisions

### Demand-signal depth
- **D-01:** Fetch demand signal via a **single Firecrawl `/search` call** returning **organic titles + snippets only**. Do NOT scrape result-page content in v1 (no `scrapeOptions` page fetch). Rationale: ~1 credit per request, fastest path, snippets are dense demand signal, stays well within the ~20s budget and the free-tier credit ceiling. Top-page content scraping is a deferred v2 upgrade.
- **D-02:** Request **10 organic results** from `/search`. Titles+snippets for 10 results comfortably fit under the ~8,000-token cap while giving broad demand coverage.
- **D-03:** Firecrawl is called with **no JSON-extraction mode and no enhanced/stealth proxy mode** (carried forward from PROJECT.md — preserves credit budget). The parser caps the assembled demand context to **~8,000 tokens** before sending to the LLM (truncation strategy is Claude's discretion).

### Backend error contract
- **D-04:** **Success** response shape: `{ ideas: VideoIdea[] }`. **Error** response shape: `{ error: { code, message } }` — a structured envelope with a stable, machine-readable `code` plus a human-readable `message`. Phase 3 switches on `code`, never on message string-matching.
- **D-05:** Error code → HTTP status taxonomy:
  - `VALIDATION` → **400** — empty/missing/too-short keyword (returned before any external API call).
  - `NO_RESULTS` → **422** — valid request, but Firecrawl returned 0 organic results. A distinct handled failure, not a 200-with-empty-array.
  - `RATE_LIMITED` → **429** — an upstream provider (Gemini or Firecrawl) returned a rate-limit / quota error. Surfaced honestly and distinctly so Phase 3 can say "free-tier limit hit." No automatic provider fallback (that is v2 / IDEAS-V2-03).
  - `UPSTREAM_ERROR` → **503** — non-rate-limit upstream failure (Firecrawl or LLM 5xx, or LLM output that still fails validation after one retry).
  - `INTERNAL` → **500** — unexpected/unclassified server error.

### Resilience & count enforcement
- **D-06:** **Retry policy:** retry an upstream call (Firecrawl or LLM) **once**, with a short backoff, only on **transient errors (5xx / network)**. Do NOT retry rate-limit (429) responses — that just re-hits the quota wall and burns the time budget.
- **D-07:** **Idea-count enforcement** against the 8–12 target:
  - More than 12 ideas → **silently trim to 12**.
  - Fewer than 8 ideas → **one retry** of the LLM call; if it still returns fewer than 8, return `UPSTREAM_ERROR` (503).
  - Zod enforces the **minimum-8 floor** so a broken/short count never reaches the client as valid data.

### LLM provider strategy (carried forward, locked at project level)
- **D-08:** Provider abstraction via the **Vercel AI SDK**, default **Gemini 2.5 Flash** (genuinely $0). Switching to **Anthropic Haiku** is a one-env-var change (`LLM_PROVIDER`) with **no code change** — already scaffolded in `astro.config.mjs`'s `astro:env` schema (`FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER` default `gemini`).
- **D-09:** LLM output is **schema-enforced with Zod** and validated before reaching the client. Malformed/invalid responses are caught and mapped to the error contract (D-04/D-05), never rendered as broken data.

### Claude's Discretion
- **VideoIdea field set:** `title` (string), `intent` (enum: `informational` | `how-to` | `commercial` | `comparison`), `rationale` (one-sentence string), plus a **stable `id`** for client-side keys. Ideas are returned **in ranked order** (best first) — "ranked" means array order, not a separate numeric score field. (User opted not to deep-dive this; planner may adjust within the IDEAS-01..05 requirements.)
- **Structured-output mechanism:** prefer the AI SDK `generateObject` with the Zod schema (schema-native) over `generateText` + manual parse.
- **Prompt design** for synthesizing demand context into ideas.
- **Snippet/demand-context truncation strategy** under the ~8k-token cap.
- **Internal module/file layout** of the pipeline (parser, provider factory, orchestrator).
- **Exact backoff duration** for the single transient-error retry.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

This project has **no external specs or ADRs** (no `docs/` folder). The authoritative references are the planning documents and the Phase 1 scaffold below.

### Phase requirements & success criteria
- `.planning/ROADMAP.md` § "Phase 2: Backend Pipeline" — goal, the 5 success criteria, and the two suggested plan splits (02-01 types/parser/providers/factory; 02-02 Firecrawl integration/orchestrator/Zod/errors).
- `.planning/REQUIREMENTS.md` § "Demand Signal" (DEMAND-01, DEMAND-02) and § "Ideas" (IDEAS-01 through IDEAS-06) — the requirements this phase satisfies.

### Locked project-level decisions
- `.planning/PROJECT.md` § "Key Decisions" — demand signal = Firecrawl organic results (not PAA/related); swappable LLM via Vercel AI SDK default Gemini 2.5 Flash; no endpoint guard; single serverless function.
- `.planning/PROJECT.md` § "Context" — security model (keys server-only), free-tier provider details (Gemini 2.5 Flash: 1,500 req/day free; never enable billing on the Google project), Firecrawl scope correction.

### Phase 1 scaffold (the integration surface)
- `astro.config.mjs` — `astro:env` server schema declaring the four env vars; `output: 'static'` + Vercel adapter with `maxDuration: 60`.
- `src/pages/api/generate.ts` — current stub (`prerender = false` must stay the first line); this phase replaces the stub body with the real pipeline.
- `vercel.json` — `maxDuration: 60` on the API function.
- `.env.example` — placeholder env vars documenting required keys.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`astro:env` schema (astro.config.mjs):** read secrets via `import { FIRECRAWL_API_KEY, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY, LLM_PROVIDER } from 'astro:env/server'` — server-only, type-safe. All four are declared `optional: true`, so the orchestrator must guard for missing keys (map to a clear error).
- **`src/pages/api/generate.ts` stub:** already a serverless function (`export const prerender = false` first line, `POST` handler). Replace the body; keep `prerender = false` first.

### Established Patterns
- **Astro 5 API route:** `export const POST: APIRoute = async ({ request }) => ...` returning a `new Response(JSON.stringify(...), { status, headers: { 'Content-Type': 'application/json' } })`. The error contract (D-04/D-05) should be emitted in exactly this shape.
- **Single serverless function** budget: `maxDuration: 60` is set, but the product target is ~20s end-to-end — design for the budget, not the ceiling.
- **No dependencies installed yet** beyond Astro/Tailwind/Vercel adapter. This phase adds: the Vercel AI SDK + provider packages (Gemini, Anthropic), a Firecrawl client (or `fetch` to the Firecrawl API), and Zod.

### Integration Points
- The endpoint `POST /api/generate` is the contract boundary: Phase 3's client island will POST `{ keyword }` and consume `{ ideas: VideoIdea[] }` or `{ error: { code, message } }`. The `VideoIdea` type and the error `code` enum defined here are the cross-phase contract Phase 3 depends on.
- Env vars set here (keys) are configured for real in Phase 4 (Vercel project env).

</code_context>

<specifics>
## Specific Ideas

- The endpoint must be **curl-verifiable against a Vercel preview** (success criterion #1) — keep request/response plain JSON, no session/cookie assumptions.
- Provider swap (Gemini ↔ Haiku) must be a **pure env-var flip with zero code change** (success criterion #2) — the provider factory reads `LLM_PROVIDER` and returns the matching AI SDK model.
- Keep it **small and readable / interview-explainable** (project constraint) — favor a thin parser + factory + orchestrator over heavy abstraction.

</specifics>

<deferred>
## Deferred Ideas

- **Scraping top-page content** for richer demand signal (snippets + page markdown) — considered for D-01, deferred to v2; snippets are sufficient for v1.
- **Automatic provider fallback** (e.g., Groq when default is rate-limited) — v2 (IDEAS-V2-03); v1 surfaces `RATE_LIMITED` honestly instead.
- **SerpApi free tier for structured PAA/related searches** — v2 (DEMAND-V2-01).
- **VideoIdea shape deep-dive** (extra fields, explicit rank score, per-card demand annotation) — user opted not to discuss; sensible default captured under Claude's Discretion. DEMAND-V2-02 (per-card "sourced from N results") is v2.

</deferred>

---

*Phase: 02-backend-pipeline*
*Context gathered: 2026-07-01*
