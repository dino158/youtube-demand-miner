# Phase 2: Backend Pipeline - Research

**Researched:** 2026-07-01
**Domain:** Astro 5 serverless API route orchestrating Firecrawl search + Vercel AI SDK structured generation, validated with Zod
**Confidence:** HIGH (package versions/APIs verified against installed package type definitions, not just docs/training data)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Demand-signal depth**
- **D-01:** Fetch demand signal via a **single Firecrawl `/search` call** returning **organic titles + snippets only**. Do NOT scrape result-page content in v1 (no `scrapeOptions` page fetch). ~1 credit per request, fastest path, stays within ~20s budget and free-tier credit ceiling. Top-page content scraping is a deferred v2 upgrade.
- **D-02:** Request **10 organic results** from `/search`. Titles+snippets for 10 results comfortably fit under the ~8,000-token cap while giving broad demand coverage.
- **D-03:** Firecrawl is called with **no JSON-extraction mode and no enhanced/stealth proxy mode** (carried forward from PROJECT.md — preserves credit budget). The parser caps the assembled demand context to **~8,000 tokens** before sending to the LLM (truncation strategy is Claude's discretion).

**Backend error contract**
- **D-04:** **Success** response shape: `{ ideas: VideoIdea[] }`. **Error** response shape: `{ error: { code, message } }` — a structured envelope with a stable, machine-readable `code` plus a human-readable `message`. Phase 3 switches on `code`, never on message string-matching.
- **D-05:** Error code → HTTP status taxonomy:
  - `VALIDATION` → **400** — empty/missing/too-short keyword (returned before any external API call).
  - `NO_RESULTS` → **422** — valid request, but Firecrawl returned 0 organic results. A distinct handled failure, not a 200-with-empty-array.
  - `RATE_LIMITED` → **429** — an upstream provider (Gemini or Firecrawl) returned a rate-limit / quota error. Surfaced honestly and distinctly so Phase 3 can say "free-tier limit hit." No automatic provider fallback (that is v2 / IDEAS-V2-03).
  - `UPSTREAM_ERROR` → **503** — non-rate-limit upstream failure (Firecrawl or LLM 5xx, or LLM output that still fails validation after one retry).
  - `INTERNAL` → **500** — unexpected/unclassified server error.

**Resilience & count enforcement**
- **D-06:** **Retry policy:** retry an upstream call (Firecrawl or LLM) **once**, with a short backoff, only on **transient errors (5xx / network)**. Do NOT retry rate-limit (429) responses — that just re-hits the quota wall and burns the time budget.
- **D-07:** **Idea-count enforcement** against the 8–12 target:
  - More than 12 ideas → **silently trim to 12**.
  - Fewer than 8 ideas → **one retry** of the LLM call; if it still returns fewer than 8, return `UPSTREAM_ERROR` (503).
  - Zod enforces the **minimum-8 floor** so a broken/short count never reaches the client as valid data.

**LLM provider strategy (carried forward, locked at project level)**
- **D-08:** Provider abstraction via the **Vercel AI SDK**, default **Gemini 2.5 Flash** (genuinely $0). Switching to **Anthropic Haiku** is a one-env-var change (`LLM_PROVIDER`) with **no code change** — already scaffolded in `astro.config.mjs`'s `astro:env` schema (`FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER` default `gemini`).
- **D-09:** LLM output is **schema-enforced with Zod** and validated before reaching the client. Malformed/invalid responses are caught and mapped to the error contract (D-04/D-05), never rendered as broken data.

### Claude's Discretion
- **VideoIdea field set:** `title` (string), `intent` (enum: `informational` | `how-to` | `commercial` | `comparison`), `rationale` (one-sentence string), plus a **stable `id`** for client-side keys. Ideas are returned **in ranked order** (best first) — "ranked" means array order, not a separate numeric score field.
- **Structured-output mechanism:** prefer the AI SDK `generateObject` with the Zod schema (schema-native) over `generateText` + manual parse.
- **Prompt design** for synthesizing demand context into ideas.
- **Snippet/demand-context truncation strategy** under the ~8k-token cap.
- **Internal module/file layout** of the pipeline (parser, provider factory, orchestrator).
- **Exact backoff duration** for the single transient-error retry.

### Deferred Ideas (OUT OF SCOPE)
- **Scraping top-page content** for richer demand signal (snippets + page markdown) — considered for D-01, deferred to v2; snippets are sufficient for v1.
- **Automatic provider fallback** (e.g., Groq when default is rate-limited) — v2 (IDEAS-V2-03); v1 surfaces `RATE_LIMITED` honestly instead.
- **SerpApi free tier for structured PAA/related searches** — v2 (DEMAND-V2-01).
- **VideoIdea shape deep-dive** (extra fields, explicit rank score, per-card demand annotation) — user opted not to discuss; sensible default captured under Claude's Discretion. DEMAND-V2-02 (per-card "sourced from N results") is v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEMAND-01 | Backend fetches top-ranking Google organic results via Firecrawl (free tier) — titles + snippets | Firecrawl `/v2/search` request/response shape verified below; raw `fetch` recommended over SDK |
| DEMAND-02 | Backend parses Firecrawl response into a compact demand-context payload capped to LLM token budget | Token-capping heuristic (chars/4) documented below; no SDK/tokenizer dependency needed |
| IDEAS-01 | LLM synthesizes demand context into 8–12 ranked YouTube video ideas | `generateObject` + unconstrained-count Zod schema + code-level count enforcement (see "Don't Hand-Roll" — do NOT rely on Zod `.min()/.max()` on the array sent to the LLM) |
| IDEAS-02 | Each idea includes a suggested video title | `VideoIdea` Zod schema below (`title: z.string()`) |
| IDEAS-03 | Each idea includes a primary search-intent label | `intent: z.enum([...])` in schema below |
| IDEAS-04 | Each idea includes a one-sentence rationale | `rationale: z.string()` in schema below |
| IDEAS-05 | LLM output is schema-enforced and validated before reaching the UI | `generateObject` Zod integration + `NoObjectGeneratedError` handling + post-hoc count enforcement (D-07) documented below |
| IDEAS-06 | LLM provider swappable via env var, defaulting to free Gemini, Haiku as swap-in | Provider factory pattern using `@ai-sdk/google` / `@ai-sdk/anthropic` verified below; exact model IDs confirmed |
</phase_requirements>

## Summary

This phase wires together three verified, current npm packages — `ai@7.0.9`, `@ai-sdk/google@4.0.3`, `@ai-sdk/anthropic@4.0.4` (all published 2026-06-30, i.e. current as of research date) — plus `zod@4.4.3` to build a single Astro 5 serverless function. The function: (1) validates the keyword with Zod before any network call, (2) calls Firecrawl's `/v2/search` endpoint with a plain `fetch` (no SDK needed) requesting 10 web results with no `scrapeOptions`, (3) builds a token-capped demand-context string, (4) calls `generateObject` from the `ai` package against a provider resolved by a small factory keyed on `LLM_PROVIDER`, and (5) enforces the 8–12 count business rule in code (not in the Zod schema sent to the LLM, due to a confirmed AI SDK limitation — see below).

Direct inspection of the installed package `.d.ts` files (ground truth, not just docs) confirms: `generateObject` is alive and well in `ai@7.0.9` (despite some stale web content suggesting it was merged into `generateText`+`Output.object()` — that merger applies only to `generateText`'s *additional* structured-output capability; `generateObject` remains a first-class, fully-typed standalone export). `NoObjectGeneratedError` is the exact error thrown on schema-validation failure. `APICallError` (re-exported from `@ai-sdk/provider`) carries `statusCode` and `isRetryable`, which is exactly what's needed to implement D-05's `RATE_LIMITED`/`UPSTREAM_ERROR` split and D-06's retry-only-on-transient policy.

**Primary recommendation:** Use `generateObject({ model, schema, output: 'array', prompt })` with an **unconstrained** (no `.min()/.max()`) `VideoIdea` array schema for the LLM call itself, then enforce the 8–12 business rule in plain code after the call returns — a known AI SDK issue (vercel/ai#9202) confirms models don't reliably respect `minItems`/`maxItems` JSON Schema constraints, so embedding them in the LLM-facing schema risks spurious `NoObjectGeneratedError` throws instead of the graceful trim/retry behavior D-07 specifies.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `7.0.9` | Vercel AI SDK core — `generateObject`, error classes | Already locked at project level (D-08); current major as of 2026-06-30; verified via installed `.d.ts` |
| `@ai-sdk/google` | `4.0.3` | Gemini provider for the AI SDK | Default $0 provider (D-08); model factory verified below |
| `@ai-sdk/anthropic` | `4.0.4` | Anthropic provider for the AI SDK | Haiku swap-in provider (D-08) |
| `zod` | `4.4.3` | Schema validation for request body + `VideoIdea` + LLM output | Already the AI SDK's expected peer (`^3.25.76 \|\| ^4.1.8` — `4.4.3` satisfies this); D-09 mandates Zod |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none (use `fetch`) | n/a | Firecrawl `/search` call | See "Firecrawl: SDK vs fetch" below — raw `fetch` is sufficient and lighter for one endpoint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| raw `fetch` for Firecrawl | `@mendable/firecrawl-js@4.29.0` | SDK adds `axios`, an internal `firecrawl` package, `zod@^3.23.8` (a *second*, older Zod copy bundled internally — confirmed via `npm view`), and `zod-to-json-schema` as transitive dependencies, for a single endpoint call this project uses once. Adds ~5 packages for a feature `fetch` + 15 lines of code replicates. SDK becomes worth it only if v2 adds crawl/scrape/map features. |
| `generateObject` with constrained array schema | `generateObject` with unconstrained array schema + code-level count check | Constrained schema (`.min(8).max(12)`) risks `NoObjectGeneratedError` when the model returns an out-of-range count instead of allowing the graceful trim/retry D-07 specifies. Recommended: unconstrained schema for the LLM call, `.min(8)` only on the *final* response validation before sending to the client (defense-in-depth, not the retry trigger). |
| chars/4 token estimate | `tiktoken` / `js-tiktoken` | A real tokenizer is exact but adds a dependency and WASM/binary table loading for a ~20s-budget, "small and readable" project. The chars/4 heuristic is within ~10-20% of true count — sufficient for a soft 8,000-token cap with margin. |

**Installation:**
```bash
npm install ai@^7.0.9 @ai-sdk/google@^4.0.3 @ai-sdk/anthropic@^4.0.4 zod@^4.4.3
```

**Version verification:** Verified live against the npm registry on 2026-07-01 (research date):
```bash
npm view ai version          # 7.0.9 (published 2026-06-30)
npm view @ai-sdk/google version    # 4.0.3 (published 2026-06-30)
npm view @ai-sdk/anthropic version # 4.0.4 (published 2026-06-30)
npm view zod version         # 4.4.3 (published 2026-05-04)
```
All four packages were installed into a scratch directory and their `.d.ts` files inspected directly — this is the highest-confidence verification available short of Context7 (which was unavailable in this environment).

## Architecture Patterns

### Recommended Project Structure
```
src/
├── pages/api/
│   └── generate.ts        # orchestrator: parse request → call demand fetcher → call LLM → respond
├── lib/
│   ├── types.ts           # VideoIdea type/schema, ErrorCode union, demand-context type
│   ├── firecrawl.ts        # fetchDemandSignal(keyword) -> { snippets, count } via raw fetch
│   ├── demand-parser.ts    # buildDemandContext(searchResults) -> token-capped string
│   ├── llm-provider.ts     # getModel() -> LanguageModel, keyed on LLM_PROVIDER
│   ├── generate-ideas.ts   # generateIdeas(demandContext) -> VideoIdea[] (calls generateObject, enforces D-07)
│   └── errors.ts           # AppError class + toErrorResponse(code, message) -> Response
```
This matches the ROADMAP.md's suggested split (02-01: types/parser/providers/factory; 02-02: Firecrawl integration/orchestrator/Zod/errors) and keeps each file small/interview-explainable.

### Pattern 1: Provider Factory Keyed on Env Var
**What:** A function that reads `LLM_PROVIDER` (`astro:env/server`) and returns the right AI SDK `LanguageModel` instance — zero code change to swap providers (success criterion #2).
**When to use:** Called once per request inside the orchestrator, before the `generateObject` call.
**Example:**
```typescript
// src/lib/llm-provider.ts
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { LLM_PROVIDER, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY } from 'astro:env/server';
import type { LanguageModel } from 'ai';

export function getModel(): LanguageModel {
  if (LLM_PROVIDER === 'haiku') {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    // @ai-sdk/anthropic defaults to reading ANTHROPIC_API_KEY itself, but
    // passing it explicitly avoids relying on process.env in the Vercel
    // serverless runtime and keeps astro:env as the single source of truth.
    return anthropic('claude-haiku-4-5');
  }
  if (!GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY is not set');
  return google('gemini-2.5-flash');
}
```
**Important verified gotcha:** `@ai-sdk/google`'s default API key env var is `GOOGLE_GENERATIVE_AI_API_KEY` (confirmed in `GoogleProviderSettings` JSDoc: *"It defaults to the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable"*), **not** `GOOGLE_AI_API_KEY`, which is what this project's scaffold already declares in `astro.config.mjs`. The bare `google(...)` singleton import will silently look for the wrong env var name in `process.env`. **Plan must use `createGoogle({ apiKey: GOOGLE_AI_API_KEY })` (the factory function) instead of the bare `google` singleton**, so the explicitly-typed `astro:env` value is passed through rather than relying on an env var name mismatch:
```typescript
import { createGoogle } from '@ai-sdk/google';
const googleProvider = createGoogle({ apiKey: GOOGLE_AI_API_KEY });
return googleProvider('gemini-2.5-flash');
```
`@ai-sdk/anthropic`'s default (`ANTHROPIC_API_KEY`) happens to match this project's scaffolded var name exactly, so the bare `anthropic` singleton would technically work for that provider — but for symmetry/explicitness, use `createAnthropic({ apiKey: ANTHROPIC_API_KEY })` for both.

### Pattern 2: Structured Generation with Unconstrained Schema + Code-Level Count Enforcement
**What:** Call `generateObject` with `output: 'array'` and a per-item Zod schema (no `.min()/.max()` on the array itself), then enforce the 8–12 rule in code per D-07.
**When to use:** The core LLM call in the orchestrator.
**Example:**
```typescript
// src/lib/types.ts
import { z } from 'zod';

export const IntentEnum = z.enum(['informational', 'how-to', 'commercial', 'comparison']);

// Schema sent to the LLM — deliberately UNCONSTRAINED on array length.
// See "Don't Hand-Roll" — minItems/maxItems are not reliably honored by models.
export const VideoIdeaLLMSchema = z.object({
  title: z.string(),
  intent: IntentEnum,
  rationale: z.string(),
});

// Schema for the final client-facing response (id added, count floor enforced
// as defense-in-depth — the *retry* trigger is the code-level check, not this).
export const VideoIdeaSchema = VideoIdeaLLMSchema.extend({ id: z.string() });
export const VideoIdeaListSchema = z.array(VideoIdeaSchema).min(8);

export type VideoIdea = z.infer<typeof VideoIdeaSchema>;
```
```typescript
// src/lib/generate-ideas.ts
import { generateObject, NoObjectGeneratedError } from 'ai';
import { randomUUID } from 'node:crypto';
import { VideoIdeaLLMSchema, type VideoIdea } from './types';
import { getModel } from './llm-provider';

async function callLLM(demandContext: string, keyword: string) {
  const { object } = await generateObject({
    model: getModel(),
    output: 'array',
    schema: VideoIdeaLLMSchema,
    schemaName: 'VideoIdeas',
    schemaDescription: 'A list of YouTube video ideas grounded in search demand.',
    prompt: buildPrompt(keyword, demandContext),
  });
  return object; // typed as VideoIdeaLLMSchema[] at this point
}

export async function generateIdeas(demandContext: string, keyword: string): Promise<VideoIdea[]> {
  let raw = await callLLM(demandContext, keyword);

  if (raw.length < 8) {
    // D-07: one retry on under-count
    raw = await callLLM(demandContext, keyword);
    if (raw.length < 8) {
      throw new AppError('UPSTREAM_ERROR', 'LLM returned too few ideas after retry');
    }
  }

  const trimmed = raw.length > 12 ? raw.slice(0, 12) : raw; // D-07: silent trim
  const withIds = trimmed.map((idea) => ({ ...idea, id: randomUUID() }));

  return VideoIdeaListSchema.parse(withIds); // defense-in-depth final check
}
```
Source for `generateObject`'s `output: 'array'` mode, `schemaName`/`schemaDescription` fields, and `NoObjectGeneratedError`: confirmed directly in `ai@7.0.9`'s `dist/index.d.ts` (lines ~7215-7252 for the function signature, ~6683-6708 for the error class).

### Pattern 3: Firecrawl `/search` via Raw Fetch
**What:** A single POST to Firecrawl's search endpoint, no SDK.
**When to use:** `src/lib/firecrawl.ts`, called once per request.
**Example:**
```typescript
// src/lib/firecrawl.ts
import { FIRECRAWL_API_KEY } from 'astro:env/server';

interface FirecrawlWebResult {
  title: string;
  description: string;
  url: string;
}

export async function searchFirecrawl(keyword: string): Promise<FirecrawlWebResult[]> {
  const res = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: keyword,
      limit: 10,
      sources: [{ type: 'web' }],
      // no scrapeOptions key at all -> no page-content fetch, no JSON extraction (D-01/D-03)
    }),
  });

  if (!res.ok) {
    // see "Common Pitfalls" for status-code -> error-code mapping
    throw toFirecrawlError(res.status, await res.text());
  }

  const json = await res.json();
  return json.data?.web ?? [];
}
```
**Note on endpoint path:** Current Firecrawl docs reference `/v2/search`. The project's `.env.example` and PROJECT.md predate this verification — confirm the exact base URL (`https://api.firecrawl.dev/v2/search`) against the Firecrawl dashboard/docs at implementation time, as Firecrawl has migrated `/v0` → `/v1` → `/v2` endpoints historically (see "State of the Art").

### Anti-Patterns to Avoid
- **Embedding `.min(8).max(12)` directly in the schema passed to `generateObject`:** Risks an unhandled `NoObjectGeneratedError` thrown by the SDK itself (because the model's raw output fails Zod validation against the constrained schema) instead of the graceful "trim to 12 / retry under 8" behavior D-07 specifies. Keep the LLM-facing schema unconstrained; enforce count in code after the call returns.
- **Reading `process.env.GOOGLE_AI_API_KEY` directly:** Bypasses the type-safe `astro:env` schema and the `optional: true` guard already in place; always import from `astro:env/server`.
- **Relying on the bare `google`/`anthropic` singleton exports:** They read API keys from the *provider's own default* env var name (`GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`), not necessarily the project's scaffolded names. Use `createGoogle({ apiKey })` / `createAnthropic({ apiKey })` factories with the value explicitly piped from `astro:env/server`.
- **Calling Firecrawl with `scrapeOptions` "just to be safe":** Directly violates D-01/D-03 (credit budget) and success criterion #4. Omit the key entirely — do not pass `scrapeOptions: {}` either, omit it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM output schema validation | Manual JSON.parse + manual field checks | `generateObject` + Zod schema (D-09) | AI SDK handles provider-specific structured-output mechanisms (tool calling / JSON mode) per provider; manual parsing reimplements this per-provider |
| Token counting for the 8k cap | A real BPE tokenizer (tiktoken) | chars-length / 4 heuristic | Tokenizer adds a dependency + WASM tables for a soft cap with margin; not worth the complexity in an interview-explainable codebase |
| Retry/backoff | A retry library (`p-retry`, `async-retry`) | A ~10-line `sleep()` + single `try/catch` with one retry | D-06 only needs ONE retry on transient errors — a library is overkill for a single-shot retry with no exponential backoff ladder |
| Firecrawl API client | Custom multi-endpoint SDK wrapper | Raw `fetch` to one endpoint | Only one Firecrawl endpoint (`/search`) is used in v1; the official SDK's value (crawl, map, batch scrape) is unused |
| Error response envelope | Ad-hoc `{ error: string }` per failure site | One `AppError` class + one `toErrorResponse()` helper | D-04 requires a *stable* `{ code, message }` shape everywhere; a single helper guarantees this instead of duplicating shape logic at every throw site |

**Key insight:** Every "don't hand-roll" item above is really "don't add a dependency, but also don't duplicate logic" — the project's size justifies a few small, hand-written utility functions over either heavyweight libraries or copy-pasted error handling.

## Common Pitfalls

### Pitfall 1: Google API key env var name mismatch
**What goes wrong:** The bare `google(...)` model call silently fails to authenticate (or throws a confusing "API key not found" error) because `@ai-sdk/google` looks for `GOOGLE_GENERATIVE_AI_API_KEY` by default, but the project scaffold defines `GOOGLE_AI_API_KEY`.
**Why it happens:** The astro.config.mjs schema var name was chosen independently of the AI SDK's internal default.
**How to avoid:** Use `createGoogle({ apiKey: GOOGLE_AI_API_KEY })` (the named factory) instead of the default singleton import, explicitly passing the astro:env value.
**Warning signs:** "GOOGLE_GENERATIVE_AI_API_KEY is missing" type errors at runtime despite `GOOGLE_AI_API_KEY` being set correctly in Vercel/`.env`.

### Pitfall 2: Schema constraints the LLM doesn't respect
**What goes wrong:** Putting `.min(8).max(12)` on the array schema passed to `generateObject` causes `NoObjectGeneratedError` whenever the model returns, say, 7 or 14 items — even though D-07 wants a *graceful* trim/retry, not a hard throw.
**Why it happens:** Confirmed via GitHub issue vercel/ai#9202 — models don't reliably honor `minItems`/`maxItems` JSON Schema constraints even when correctly present in the schema sent to them.
**How to avoid:** Use an unconstrained per-item schema for the `generateObject` call (`output: 'array'`, no array-level `.min()/.max()`); apply the 8/12 business logic in plain code after the call returns. Reserve the constrained schema for a final, internal `safeParse` defense-in-depth check (which should never actually fail if the code-level logic is correct).
**Warning signs:** Intermittent `NoObjectGeneratedError` in logs correlating with idea counts just outside [8,12], rather than genuine malformed JSON.

### Pitfall 3: Firecrawl endpoint version drift
**What goes wrong:** Code written against a stale `/v1/search` or `/v0/search` path 404s or behaves unexpectedly.
**Why it happens:** Firecrawl has iterated its API version prefix over time; documentation and blog posts reference different versions depending on publish date.
**How to avoid:** Confirm the exact current base path (`https://api.firecrawl.dev/v2/search` per current docs, verified 2026-07-01) against the Firecrawl dashboard "API Reference" at implementation time, and pin the exact request shape (`query`, `limit`, `sources`) shown above.
**Warning signs:** 404s or unexpected response shape (`data.web` missing) instead of clean 4xx/5xx errors.

### Pitfall 4: Distinguishing rate-limit from generic upstream failure
**What goes wrong:** A blanket `catch` maps every Firecrawl/LLM failure to `UPSTREAM_ERROR` (503), losing the distinct `RATE_LIMITED` (429) signal D-05 requires.
**Why it happens:** Both Firecrawl and the AI SDK throw on non-2xx responses; the distinguishing signal (HTTP 429, or `APICallError.statusCode === 429`) must be explicitly checked, not assumed.
**How to avoid:** For LLM calls, catch `APICallError` (re-exported from `ai`) and check `.statusCode === 429` → `RATE_LIMITED`; anything else with `.isRetryable === true` → one retry then `UPSTREAM_ERROR`. For Firecrawl, check `res.status === 429` explicitly before falling through to a generic 5xx handler.
**Warning signs:** Phase 3's "rate-limit vs. network" error distinction (UI-03) never actually triggers the rate-limit branch in testing.

### Pitfall 5: Confusing "0 results" with "request succeeded but empty"
**What goes wrong:** Firecrawl returning `{ success: true, data: { web: [] } }` (valid request, genuinely no organic results for an obscure keyword) gets treated as a generic empty-array success, producing a confusing "0 ideas" response instead of the distinct `NO_RESULTS` (422) D-05 specifies.
**Why it happens:** It's tempting to let an empty array just flow through the pipeline and let the LLM call fail naturally.
**How to avoid:** Explicitly check `webResults.length === 0` immediately after the Firecrawl call and throw `NO_RESULTS` before ever calling the LLM — this also saves an LLM call/credit.
**Warning signs:** LLM calls happening with an empty/near-empty prompt context; ideas generated with no grounding for obscure keywords instead of a clean 422.

## Code Examples

### Astro API Route Orchestrator Skeleton
```typescript
// Source: pattern verified against astro@5.18.2 installed type defs (APIRoute, APIContext.request: Request)
export const prerender = false; // MUST stay first

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { searchFirecrawl } from '../../lib/firecrawl';
import { buildDemandContext } from '../../lib/demand-parser';
import { generateIdeas } from '../../lib/generate-ideas';
import { AppError, toErrorResponse } from '../../lib/errors';

const RequestSchema = z.object({
  keyword: z.string().trim().min(3, 'Keyword must be at least 3 characters'),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const { keyword } = parsed.data;

    const webResults = await searchFirecrawl(keyword); // D-01/D-02/D-03, retry-once on 5xx (D-06)
    if (webResults.length === 0) {
      throw new AppError('NO_RESULTS', `No organic results found for "${keyword}"`);
    }

    const demandContext = buildDemandContext(webResults); // DEMAND-02, ~8k token cap

    const ideas = await generateIdeas(demandContext, keyword); // IDEAS-01..06, D-07/D-09

    return new Response(JSON.stringify({ ideas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return toErrorResponse(err); // maps AppError -> { error: { code, message } } + status (D-04/D-05)
  }
};
```

### Token-Capping Heuristic
```typescript
// Source: industry-standard chars/4 heuristic (no official AI SDK helper exists for this)
const CHARS_PER_TOKEN = 4;
const TOKEN_CAP = 8000;
const CHAR_CAP = TOKEN_CAP * CHARS_PER_TOKEN; // ~32,000 chars

export function buildDemandContext(results: { title: string; description: string }[]): string {
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}`);
  let context = lines.join('\n');
  if (context.length > CHAR_CAP) {
    context = context.slice(0, CHAR_CAP);
  }
  return context;
}
```
With 10 results of typical title+snippet length (title ~60 chars, snippet ~160 chars), the assembled context is roughly 2,200 chars (~550 tokens) — comfortably under the 8,000-token cap even before truncation; the cap is a safety ceiling, not an expected-path constraint, confirming D-02's reasoning.

### Retry-Once-on-Transient, Never-on-429
```typescript
// Source: pattern derived from APICallError shape confirmed in @ai-sdk/provider dist/index.d.ts
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function withSingleRetry<T>(fn: () => Promise<T>, isRetryable: (e: unknown) => boolean, backoffMs = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isRetryable(err)) {
      await sleep(backoffMs);
      return await fn();
    }
    throw err;
  }
}

// Usage for the LLM call:
import { APICallError } from 'ai';
function isTransientLLMError(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    return err.statusCode !== 429 && (err.isRetryable ?? err.statusCode! >= 500);
  }
  return err instanceof TypeError; // network-level fetch failure
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `claude-3-haiku-20240307` as "the" Haiku model | `claude-haiku-4-5` (also aliased `claude-haiku-4-5-20251001`) | Confirmed current in `@ai-sdk/anthropic@4.0.4`'s `AnthropicModelId` union (2026-06-30 publish) | Use `claude-haiku-4-5`, not the 2024 model ID, for the Haiku swap-in (D-08) |
| Firecrawl `/v0` or `/v1/search` | `/v2/search` | Per current docs.firecrawl.dev (checked 2026-07-01) | Confirm exact path at implementation time — Firecrawl has a history of version migrations |
| Some web content suggests `generateObject` was deprecated/merged into `generateText` + `Output.object()` | `generateObject` remains a live, fully-typed, first-class export in `ai@7.0.9` | N/A — this is a documentation-staleness trap, not a real deprecation | Trust the installed package's `.d.ts`, not summarized web content, for this specific claim (see Metadata/confidence notes) |

**Deprecated/outdated:** None directly relevant beyond the Haiku model ID drift above — the stack here is current as of the research date.

## Open Questions

1. **Exact Firecrawl base URL/version path**
   - What we know: Current docs (docs.firecrawl.dev, checked 2026-07-01) show `/v2/search`.
   - What's unclear: Whether the user's existing Firecrawl account/key is provisioned against a `/v1` or `/v2` API generation, and whether there's any account-level default version pinning.
   - Recommendation: Confirm against the Firecrawl dashboard or a single manual `curl` test with the real API key before finalizing the plan's exact endpoint constant; treat the base URL as a single named constant in `firecrawl.ts` so a version bump is a one-line change.

2. **Exact Firecrawl 429/402 JSON body shape**
   - What we know: Status code 429 = rate/concurrency limit, 402 = insufficient credits; body follows `{ success: false, error: string }` base shape per docs.
   - What's unclear: Whether a machine-readable `code` field is present in the body for programmatic branching, or whether the plan must branch on HTTP status code alone.
   - Recommendation: Branch on HTTP status code only (`res.status === 429` → `RATE_LIMITED`, `res.status >= 500` → retryable per D-06, else `UPSTREAM_ERROR`) — do not depend on parsing an `error` message string, consistent with D-04's "never string-match" principle applied to upstream responses too.

3. **Gemini free-tier RPM ceiling (10 RPM per most current sources)**
   - What we know: Multiple 2026 sources converge on roughly 10 RPM / 1,500 RPD for Gemini 2.5 Flash free tier (down from an earlier, higher RPM figure per some sources — Google reportedly tightened limits).
   - What's unclear: The exact current number is moving target across sources (10 vs 15 RPM cited differently); not independently confirmed against Google's live rate-limits page in this research pass.
   - Recommendation: Don't hardcode any RPM assumption into the code; the `RATE_LIMITED` (429) handling (D-05) already treats this as an opaque upstream signal regardless of the exact ceiling. Worth a one-line README note in Phase 4 about expecting occasional 429s under demo load.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Astro/Vercel serverless runtime | ✓ | engines requires >=22.12.0 (project) / >=22.0.0 (firecrawl-js, unused) | — |
| `ai` package | LLM orchestration | ✓ (verified via npm registry, not yet installed in project) | 7.0.9 | — |
| `@ai-sdk/google` | Default Gemini provider | ✓ (verified via npm registry) | 4.0.3 | — |
| `@ai-sdk/anthropic` | Haiku swap-in provider | ✓ (verified via npm registry) | 4.0.4 | — |
| `zod` | Schema validation | ✓ (verified via npm registry; compatible with AI SDK peer range) | 4.4.3 | — |
| `FIRECRAWL_API_KEY` | Demand signal fetch | Declared in `.env.example`, optional in schema | — | Orchestrator must throw a clear `INTERNAL`/config error if missing at runtime, not crash unhandled |
| `GOOGLE_AI_API_KEY` | Default LLM provider | Declared in `.env.example`, optional in schema | — | Same as above; also must be explicitly piped via `createGoogle({ apiKey })`, not relied on as an ambient env var |
| `ANTHROPIC_API_KEY` | Haiku swap-in | Declared in `.env.example`, optional in schema | — | Only required when `LLM_PROVIDER=haiku`; absence should produce a clear startup-time/request-time error, not a silent Gemini fallback (D-08 says zero code change for the swap, not automatic fallback) |

**Missing dependencies with no fallback:** None — all required npm packages are published and installable; all required API keys are the user's responsibility to provide (already scaffolded as optional+guarded in `astro:env`).

**Missing dependencies with fallback:** None identified for this phase.

## Sources

### Primary (HIGH confidence)
- Installed package type definitions (ground truth, inspected directly): `ai@7.0.9/dist/index.d.ts` (generateObject signature, NoObjectGeneratedError, APICallError re-export, exports list including confirmed presence of `generateObject`), `@ai-sdk/provider/dist/index.d.ts` (APICallError full shape: `statusCode`, `isRetryable`, `responseHeaders`), `@ai-sdk/google/dist/index.d.ts` (GoogleProviderSettings apiKey env default, GoogleModelId union including `gemini-2.5-flash`, GoogleProvider call signature, createGoogle factory), `@ai-sdk/anthropic/dist/index.d.ts` (AnthropicProviderSettings, AnthropicModelId union including `claude-haiku-4-5`, createAnthropic factory), `@mendable/firecrawl-js@4.29.0` package.json dependencies (confirms bundled `zod@^3.23.8` is a regular dependency, not peerDependency — no conflict, but adds weight)
- `npm view <pkg> version` / `npm view <pkg> time --json` — live npm registry queries run 2026-07-01, confirming all four core packages were published 2026-05-04 (zod) through 2026-06-30 (ai, @ai-sdk/google, @ai-sdk/anthropic) — i.e., current as of research date
- Local installed `astro@5.18.2` type defs (`node_modules/astro/dist/types/public/common.d.ts`) — confirms `APIRoute` type signature `(context: APIContext) => Response | Promise<Response>`
- Local Zod 4.4.3 runtime test — confirmed `.min(8)` on `z.array()` produces a `too_small` issue on `safeParse`, and `z.toJSONSchema()` correctly renders `minItems`/`maxItems`

### Secondary (MEDIUM confidence)
- [Firecrawl Search API Reference](https://docs.firecrawl.dev/api-reference/endpoint/search) — request/response shape for `/v2/search`, auth header format
- [Firecrawl Rate Limits docs](https://github.com/firecrawl/firecrawl-docs/blob/main/rate-limits.mdx) and [Errors reference](https://docs.firecrawl.dev/api-reference/errors) — 429/402 status codes and base error body shape `{ success: false, error: string }`
- [Astro Environment Variables guide](https://docs.astro.build/en/guides/environment-variables/) — confirms current `astro:env` schema/import pattern matches the existing scaffold exactly
- [GitHub issue vercel/ai#9202](https://github.com/vercel/ai/issues/9202) — confirms models don't reliably respect Zod `.min()/.max()` array constraints passed through to `generateObject`, directly informing the "unconstrained schema + code-level enforcement" recommendation

### Tertiary (LOW confidence)
- WebSearch-aggregated figures on Gemini 2.5 Flash free-tier RPM/RPD (10-15 RPM, 1,500 RPD cited inconsistently across sources) — not independently confirmed against Google's live rate-limits page; flagged in Open Questions
- A WebFetch summary of ai-sdk.dev's structured-data docs initially suggested `generateObject` was "replaced" by `generateText` + `Output.object()` — this was directly contradicted by inspecting the installed package, demonstrating the value of verifying web-summarized claims against ground truth. Treat any single WebFetch/WebSearch claim about this SDK's API surface as needing package-level verification before trusting it.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and exact type signatures verified directly against installed package `.d.ts` files, not just documentation summaries
- Architecture: HIGH — patterns derived from verified type signatures (generateObject, APIRoute, astro:env) plus the project's own existing, working scaffold
- Pitfalls: HIGH for the Google API key env var mismatch and the Zod min/max constraint issue (both independently verified — one via direct JSDoc inspection, one via a corroborating GitHub issue); MEDIUM for exact Firecrawl error body shape (docs-only, not tested against a live key in this research pass)

**Research date:** 2026-07-01
**Valid until:** 2026-07-15 (14 days) — the `ai`/`@ai-sdk/*` packages are publishing new versions roughly weekly as of this research (both `ai` and `@ai-sdk/anthropic` republished the same day this research was conducted), so re-verify exact versions/model IDs immediately before implementation if more than ~2 weeks elapse.
