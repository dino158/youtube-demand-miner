# Project Research Summary

**Project:** GTM — Keyword to YouTube Video Ideas Generator
**Domain:** Free-tier single-page web tool (Astro SPA + Vercel serverless + Firecrawl + Gemini)
**Researched:** 2026-06-30
**Confidence:** HIGH (stack and architecture fully verified against official docs; features inferred from competitor analysis)

---

## SCOPE ADJUSTMENT NEEDED

Three of the four research dimensions independently converged on a critical finding that contradicts the tool's stated core flow:

**Firecrawl cannot scrape google.com directly and cannot return People Also Ask or related searches as structured SERP fields.**

Firecrawl's `/search` endpoint returns organic result titles, URLs, and description snippets from its own index — not Google's SERP. Attempts to pass `https://www.google.com/search?q=...` to Firecrawl's `/scrape` endpoint return CAPTCHA pages or blocked responses; Google's bot detection is not bypassable via Firecrawl's cloud infrastructure.

**The realistic pipeline is:** keyword → Firecrawl `/search` (top organic URLs + titles + snippets) → optionally scrape top result page content as markdown → LLM synthesizes 8–12 video ideas from that demand context.

**SerpApi fallback for structured PAA:** SerpApi offers 100 free searches/month (no credit card, renewable) and returns PAA and related searches as structured JSON. This is viable as a secondary data source or dev/test supplement, but should not be the primary pipeline given the 100-query/month ceiling. A scope decision is needed: proceed with Firecrawl's organic-results approach (recommended) or add SerpApi as a PAA layer at the cost of a second API dependency and hard monthly quota.

---

## Executive Summary

This is a free-tier, single-page, stateless web tool that takes a keyword and returns 8–12 YouTube video ideas grounded in web demand signals. The correct expert pattern for this category is: minimal frontend (Astro static SPA), one serverless function (Vercel Hobby, free), one scraping service (Firecrawl, 1,000 credits/month free), and one free LLM (Gemini 2.5 Flash, 1,500 requests/day free). No database, no auth, no sessions. Every request is keyword-in → ideas-out. The architecture is deliberately minimal: a 3-step sequential pipeline (scrape → parse → LLM) exposed as a single POST endpoint, with a strategy pattern for swappable LLM providers (Gemini default, Haiku opt-in via env var).

The tool differentiates from competitors (vidIQ, ryrob, AnswerThePublic) by grounding ideas in real web demand context rather than pure LLM generation, by adding YouTube-native intent labels per idea (Tutorial, Comparison, Review, etc.), by providing a one-line rationale per idea, and by offering copy-all-as-Markdown and JSON export that no direct competitor provides. These differentiators are achievable with the free-tier stack and require no architectural additions — they are primarily prompt engineering and UI decisions.

The two most consequential risks are: (1) the Firecrawl SERP scope limitation described above — the pipeline must be designed around organic content scraping, not SERP feature extraction; and (2) free-tier exhaustion by bots or a viral moment — the public, unauthenticated API endpoint must have IP-based WAF rate limiting in place before any public deployment. A pipeline that takes 15–25 seconds end-to-end must stream progress to the browser to avoid appearing broken. Cold starts on Vercel Hobby add 500ms–2s to first-request latency on an already-slow pipeline, making a progress indicator non-optional.

---

## Key Findings

### Recommended Stack

The correct stack for a $0 constraint is Astro 5 (not 6 — known Vercel adapter SSR bugs in v6), `@astrojs/vercel` v11 with `output: 'hybrid'`, Tailwind CSS v4 via `@tailwindcss/vite` (the `@astrojs/tailwind` integration is deprecated for v4), the Firecrawl JS SDK for demand signal retrieval, and Gemini 2.5 Flash via `@google/genai` v2 (the legacy `@google/generative-ai` package was deprecated November 2025, support ends August 2026). The Vercel AI SDK (`ai` v7 + `@ai-sdk/google`) is recommended over direct SDK calls because the provider-swap requirement (Gemini default, Haiku opt-in) is otherwise a code-change operation. With the AI SDK, switching providers is a single env var change.

Vercel Hobby's function timeout is 300 seconds with Fluid Compute (enabled by default for new projects), not the 10 seconds cited in most tutorials. A 20-second pipeline is well within budget. The Firecrawl free tier provides 1,000 credits/month; at 2 credits per search call (10 results), this supports ~500 user requests/month before credits expire. Gemini 2.5 Flash is free at 15 RPM and 1,500 RPD with no credit card required and no trial expiry. Groq (Llama 3.1 8B Instant, 14,400 RPD free) is the recommended LLM fallback if Gemini quota is exhausted.

**Core technologies:**
- Astro 5.x (hybrid output): Static SPA shell with one serverless API route — ships near-zero JS, Vite-based, Vercel adapter v11 is stable
- `@astrojs/vercel` v11: Hybrid adapter — static pages + one serverless function, `maxDuration` configurable
- Tailwind CSS v4 via `@tailwindcss/vite`: Styling — `@astrojs/tailwind` is deprecated for v4
- Firecrawl JS SDK: Organic search results (titles + snippets) and optional page content scraping — 1,000 credits/month free
- `@google/genai` v2 (or `@ai-sdk/google` v4): Gemini 2.5 Flash — genuinely free at 1,500 RPD, no credit card
- Vercel AI SDK (`ai` v7): Swappable LLM provider abstraction — swap Gemini to Haiku via one env var
- Zod 3.x: Input validation on the API endpoint before any external call

**Critical version notes:**
- Astro 6 has known `@astrojs/vercel` SSR esbuild errors (GitHub #16258); use Astro 5 until resolved
- `@google/generative-ai` (legacy) is deprecated — use `@google/genai` v2 or `@ai-sdk/google`
- `@astrojs/vercel/serverless` import path was removed in v11 — use `import vercel from '@astrojs/vercel'`
- Enabling billing on the Google AI Studio project removes the free tier entirely — never enable billing on this project

### Expected Features

The tool's table stakes are the keyword input, 8–12 ranked idea cards (each with title + YouTube-native intent label + one-line rationale), loading and error states, copy-individual and copy-all-as-Markdown, JSON export, and a mobile-responsive layout. These are non-negotiable for launch. No comparable competitor offers copy-all-as-Markdown or JSON export, making these cheap differentiators worth including at v1.

The primary competitive differentiators are: YouTube-native intent taxonomy (Tutorial / How-To / Comparison / Review / Listicle / Deep Dive / Beginner Guide / Case Study / Mistake — not generic SEO labels), demand signal annotation per card ("sourced from X organic results"), ranked output with ranking rationale, and shareable URL encoding via base64 query params (no DB required). These are v1.x additions, not launch blockers.

**Must have (table stakes):**
- Keyword input + submit with client-side validation (min 3–4 chars)
- Firecrawl demand signal fetch (organic search results)
- LLM synthesis into 8–12 ranked video ideas
- Idea cards: title + YouTube-native intent label + one-line rationale
- Loading state with progress steps (not just a spinner — pipeline takes 15–25s)
- Error state with specific messages (rate limit vs. network failure vs. empty result)
- Copy individual idea to clipboard
- Copy-all as Markdown
- Export as JSON
- Mobile-responsive single-column layout

**Should have (differentiators, v1.x):**
- Demand signal annotation per card ("Sourced from N organic results")
- Shareable URL with encoded query + results (no DB needed)
- Collapsible SERP source panel showing top organic result titles
- Idea quality badge (High/Medium/Low demand signal strength)

**Defer (v2+):**
- Regenerate/refine with follow-up input (stateful UX complexity)
- Bulk/batch keyword processing (requires job queue or DB)
- User accounts or saved history (requires auth + DB)
- Exact search volume numbers (requires paid API)
- YouTube Data API integration (OAuth, quota complexity)

### Architecture Approach

The architecture is a static Astro SPA (served from Vercel CDN) with one Vercel serverless function at `/api/generate`. The function is a 3-step sequential orchestrator: (1) Firecrawl `/search` returns top organic result titles + snippets + optionally page markdown; (2) a demand parser concatenates and truncates this content to ~8,000 tokens; (3) an LLM provider (selected by env var factory) generates a structured JSON array of 8–12 `VideoIdea` objects. The browser sends only the keyword string; all API keys live server-side. No database, no cache, no auth, no sessions — each request is fully stateless.

**Major components:**
1. `src/pages/index.astro` (Static Shell): HTML, CSS load, boots the client island — no dynamic rendering
2. `src/scripts/app.ts` (Client Island): Form submit handler, POST to `/api/generate`, loading/error state, card rendering — plain DOM manipulation, no framework
3. `api/generate.ts` (Serverless Orchestrator): Validates input, runs Firecrawl → parser → LLM in sequence, returns `{ ideas: VideoIdea[] }` — the single Vercel function
4. `src/lib/llm/` (Provider Strategy): `types.ts` defines `LLMProvider` interface and `VideoIdea` type; `gemini.ts` and `haiku.ts` implement it; `index.ts` factory reads `LLM_PROVIDER` env var and returns the correct provider
5. `src/lib/parser.ts` (Demand Parser): Extracts and truncates signal text from Firecrawl response; isolates parsing logic from the orchestrator

Key patterns: structured JSON output via `responseMimeType: "application/json"` + `responseSchema` (not just prompt instructions — schema enforcement at the API level); strategy pattern for LLM provider swapping; `export const prerender = false` on the API endpoint (required for hybrid output mode); all secrets accessed only in server-side files.

### Critical Pitfalls

1. **Firecrawl cannot return PAA/related searches as structured data** — Re-scope the pipeline: use Firecrawl `/search` for organic result titles + snippets, optionally scrape top result content as markdown, feed to LLM. Never attempt to scrape `google.com` via Firecrawl — it returns CAPTCHA/blocked responses. SerpApi (100 free searches/month) is the only viable free fallback for structured PAA data; requires a scope decision.

2. **Vercel timeout misconfiguration** — Explicitly set `maxDuration: 60` in `vercel.json` on the API function. Older scaffold templates default to 10 seconds; the 20s pipeline will 504 on every real user request. Verify Fluid Compute is enabled in project settings. Design the response as SSE or chunked transfer so the browser shows progress before the full pipeline completes.

3. **Free-tier exhaustion by bots** — Before any public deployment, configure a Vercel WAF rule limiting requests to `/api/generate` to N/minute per IP (N=5 is generous for humans, blocking for bots). Add client-side debouncing and minimum keyword length. Firecrawl free tier exhaustion means a 30-day wait with no recovery option.

4. **Firecrawl credit multipliers** — Do not enable JSON extraction mode (+4 credits/page) or enhanced proxy mode (+4 credits/page) on Firecrawl calls. Use raw markdown from `/search` and let the LLM extract structure. Enabling both modes burns the entire monthly free quota in ~55 requests.

5. **API key exposure in Astro** — Never prefix Firecrawl or Gemini keys with `PUBLIC_`. Access all secrets only in `api/generate.ts`. Use `astro:env` with `context: "server", access: "secret"` to enforce this at the type-system level. Add `.env` to `.gitignore` before the first `git add`.

6. **LLM structured output unreliability** — Always pair `responseMimeType: "application/json"` with `responseSchema` (not one or the other). Wrap every `JSON.parse()` in try/catch with markdown fence stripping fallback. Validate parsed output with Zod before returning to the client. Cap scraped content at ~8,000 tokens to prevent output truncation.

7. **`export const prerender = false` missing on endpoint** — With `output: 'hybrid'`, omitting this line causes the API endpoint to be statically generated at build time. It appears to work in `astro dev` but returns HTML (or 405) in production. Make this the first line of every API endpoint file.

---

## Implications for Roadmap

Based on combined research, the following phase structure is recommended. The dependency order is driven by the architecture's 3-step pipeline: the endpoint cannot be built until types are defined, the frontend cannot be wired until the endpoint works, and UX polish (streaming, copy actions) cannot be added until cards render correctly.

### Phase 1: Infrastructure and Scope Lock

**Rationale:** All critical pitfalls require decisions and configuration before any integration code is written. The Firecrawl scope limitation changes what data the pipeline produces. The Vercel timeout, WAF rate limiting, API key security, and `prerender = false` pattern must all be in place before the pipeline is wired.

**Delivers:** Working Astro+Vercel scaffold with hybrid output, configured `vercel.json` (`maxDuration: 60`), `.env` and `.gitignore` properly configured, `astro:env` schema enforcing server-secret types, Vercel WAF rate limit rule on `/api/generate`, documented scope decision on Firecrawl-only vs. SerpApi-augmented pipeline.

**Addresses:** Table stakes (scaffold foundation), all Phase 1 pitfalls (timeout config, key security, prerender, WAF)

**Avoids:** Pitfalls 1 (Firecrawl scope), 2 (timeout), 4 (credit multipliers), 5 (key exposure), 8 (prerender/CORS)

**Research flag:** No additional research needed — patterns are fully documented in STACK.md and ARCHITECTURE.md.

### Phase 2: Backend Pipeline (Types → LLM → Firecrawl → Endpoint)

**Rationale:** Build in dependency order: types first (no dependencies), then LLM providers (depend on types), then demand parser (no external dependencies), then the serverless orchestrator (depends on all three). Test each component in isolation with fixtures before wiring. The LLM structured output validation layer must exist before connecting to the UI.

**Delivers:** Working `POST /api/generate` endpoint that accepts `{ keyword }` and returns `{ ideas: VideoIdea[] }` — verified with `curl` against a Vercel preview deployment. LLM retry logic (exponential backoff for Gemini 429), Zod validation on LLM output, credit-cost-audited Firecrawl call configuration, error responses using the `{ error: string }` shape.

**Uses:** Firecrawl JS SDK (`/search` endpoint, no JSON mode, no enhanced proxy), `@google/genai` v2 with `responseMimeType` + `responseSchema`, Zod for output validation, `getProvider()` factory reading `LLM_PROVIDER` env var

**Implements:** LLM Provider Strategy pattern, Demand Parser component, Single-File Serverless Orchestrator pattern

**Avoids:** Pitfalls 6 (Gemini quota), 7 (LLM JSON unreliability), 9 (Firecrawl credit multipliers)

**Research flag:** No additional research needed for core pipeline. If scope decision from Phase 1 includes SerpApi, a targeted integration spike is needed (SerpApi auth pattern, PAA response shape, combining with Firecrawl results in the parser).

### Phase 3: Frontend and Core UX

**Rationale:** Frontend can only be built once the endpoint contract (`VideoIdea` type, error shapes) is confirmed stable. Build the static shell with hardcoded placeholder cards first, then wire the client island. Streaming/progress UI must be designed before the client island is written because it changes the response format (SSE vs. JSON).

**Delivers:** Complete end-to-end flow in the browser: keyword input → submit → loading state with step labels ("Searching pages...", "Analyzing content...", "Generating ideas...") → 8–12 idea cards (title + YouTube-native intent badge + one-line rationale) → error state with specific messages. Mobile-responsive single-column layout.

**Addresses:** All P1 table-stakes features: keyword input, idea cards with title/intent/rationale, loading state, error state, mobile layout

**Avoids:** Pitfall 10 (cold start perceived latency — streaming progress indicator is the mitigation)

**Research flag:** No additional research needed — UI patterns are documented and competitors are analyzed in FEATURES.md.

### Phase 4: Export, Copy, and Polish

**Rationale:** Export and copy features are only possible once card data is in component state. They are trivially low-complexity but require the card rendering to be complete and stable. This phase also adds the "looks done but isn't" verification checklist items.

**Delivers:** Copy individual idea to clipboard (one button per card), copy-all as Markdown (single button, formatted as `## [Title]\n**Intent:** X\n**Rationale:** Y`), export as JSON (Blob download), "Analyzing demand takes 15–30 seconds" expectation-setting copy near submit button, footer note about free-tier availability.

**Addresses:** P1 export features (copy, Markdown, JSON), UX polish (latency expectation-setting)

**Research flag:** No research needed — implementation is documented in FEATURES.md and ARCHITECTURE.md.

### Phase 5: Demand Signal Transparency and Shareable URLs (v1.x)

**Rationale:** These differentiators add meaningful trust and shareability but require the core flow to be stable first. Demand signal annotation requires extending the `VideoIdea` schema with a `signalCount` or `signalSources` field — a breaking change to the API contract if done after Phase 4.

**Delivers:** Demand signal annotation per card ("Sourced from N organic results"), idea quality badge (High/Medium/Low), shareable URL encoding (base64 of keyword + results in URL hash), optionally collapsible SERP source panel.

**Addresses:** P2 differentiator features from FEATURES.md

**Research flag:** Shareable URL encoding is straightforward. Demand signal annotation requires confirming what metadata the Firecrawl `/search` response returns — may need a brief spike before Phase 2 types are finalized.

### Phase Ordering Rationale

- Phase 1 before everything: Scope and security decisions cannot be undone cheaply. The Firecrawl limitation affects what the entire pipeline produces. WAF and env var security are permanently broken if deferred.
- Phase 2 before Phase 3: The API contract (`VideoIdea` type, error shapes) must be stable before the frontend is wired. Building the UI against a moving contract causes rework.
- Phase 4 after Phase 3: Export features require card data in component state — they cannot exist before cards render.
- Phase 5 last: Demand signal annotation is a schema-affecting change to the `VideoIdea` type. Better to finalize once the Phase 2 contract is in production and validated.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (scope decision):** If PAA data is required, a targeted spike on SerpApi integration (auth, response shape, combining with Firecrawl) is needed before Phase 2.
- **Phase 5 (demand signal annotation):** Brief spike to confirm what structured metadata the Firecrawl `/search` response returns per result.

Phases with standard patterns (skip research-phase):
- **Phase 2:** All integration patterns are fully documented with working code examples in STACK.md and ARCHITECTURE.md.
- **Phase 3:** Astro + plain DOM client island is well-documented; streaming SSE from Vercel serverless is standard.
- **Phase 4:** Copy-to-clipboard and JSON export are trivial browser APIs.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All critical limits verified against official docs (Vercel, Firecrawl, Google AI, Astro). Version compatibility confirmed. |
| Features | MEDIUM-HIGH | Table stakes and differentiators derived from competitor analysis and UX research, not direct user interviews. |
| Architecture | HIGH | All key claims verified against official documentation. Code patterns confirmed working. |
| Pitfalls | HIGH | Vercel/Firecrawl/Gemini limits verified via official docs; SERP blocking behavior verified via multiple community and official sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Firecrawl `/search` response shape:** Confirm exactly which metadata fields are returned per result on the free tier before finalizing the parser design. A quick API test with a real key before Phase 2 resolves this.
- **Scope decision — SerpApi:** The product owner must decide before Phase 2 whether PAA data is required (adds SerpApi dependency, 100/month ceiling) or whether the organic-content approach is acceptable.
- **Gemini 2.5 Flash-Lite vs. Flash:** Flash-Lite offers 30 RPM vs. 15 for Flash on the free tier. Should be validated with a prompt quality comparison if burst capacity is a concern.
- **Streaming response format:** SSE vs. chunked transfer for the progress indicator affects the client island implementation. Decide in Phase 3 spec before writing streaming code.

---

## Sources

### Primary (HIGH confidence — official documentation)
- https://vercel.com/docs/plans/hobby — Hobby plan limits (verified 2026-06-16)
- https://vercel.com/docs/functions/limitations — 300s Fluid Compute limit (verified 2026-06-19)
- https://www.firecrawl.dev/pricing — 1,000 credits/month, no credit card (verified 2026-06-30)
- https://docs.firecrawl.dev/rate-limits — 10 scrape req/min, 5 search req/min, 2 concurrent browsers
- https://ai.google.dev/gemini-api/docs/rate-limits — Gemini free tier confirmed (official)
- https://ai.google.dev/gemini-api/docs/structured-output — Gemini JSON schema enforcement (official)
- https://docs.astro.build/en/guides/integrations-guide/vercel/ — v11 import path, hybrid output, maxDuration
- https://tailwindcss.com/docs/installation/framework-guides/astro — @tailwindcss/vite path for Astro v4
- https://ai-sdk.dev/docs/ai-sdk-core/providers-and-models — AI SDK v7 provider pattern
- https://github.com/google-gemini/deprecated-generative-ai-js — @google/generative-ai deprecation confirmed
- https://vercel.com/docs/limits/fair-use-guidelines — Hobby commercial use prohibition

### Secondary (MEDIUM confidence — third-party, cross-referenced)
- https://tokenmix.ai/blog/gemini-api-free-tier-limits — Gemini 2.5 Flash: 15 RPM, 1,500 RPD (cross-referenced with official AI Studio)
- https://console.groq.com/docs/rate-limits — Groq Llama free tier limits
- https://github.com/firecrawl/firecrawl/issues/2257 — Firecrawl blocked on google.com (community confirmed)
- https://filipkonecny.com/2026/03/29/firecrawl-limitations/ — Firecrawl SERP limitations analysis
- https://www.aifreeapi.com/en/posts/gemini-api-error-429-resource-exhausted-fix — Gemini December 2025 quota changes
- https://usagebox.com/articles/gemini-api-billing-free-tier-confusion — Billing removes free tier
- Competitor audits: vidIQ, ryrob, AnswerThePublic, AlsoAsked (direct tool testing)

### Tertiary (context only)
- https://www.nngroup.com/articles/cards-component/ — Cards vs. lists UX guidance
- https://serpapi.com/blog/serpapi-vs-firecrawl/ — SerpApi vs Firecrawl comparison

---
*Research completed: 2026-06-30*
*Ready for roadmap: yes*
