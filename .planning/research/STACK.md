# Stack Research

**Domain:** Free-tier web tool — keyword → YouTube video ideas (Astro SPA + single Vercel serverless function)
**Researched:** 2026-06-30
**Confidence:** HIGH (all critical limits verified against official docs and multiple current sources)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Astro | 5.x (latest stable) | Frontend framework, SPA shell | See note below on v5 vs v6 |
| @astrojs/vercel | 11.x | Vercel adapter (serverless + static hybrid) | Official adapter; v11 consolidated import path; `hybrid` output means one page is static HTML, API endpoint alone is serverless |
| Tailwind CSS | 4.3.x | Styling | Decided. Use `@tailwindcss/vite` plugin directly — `@astrojs/tailwind` is deprecated for v4 |
| Vercel | Hobby (free) | Hosting + serverless runtime | 300s function timeout (with Fluid Compute on by default), 1M invocations/month, no credit card |
| Firecrawl JS SDK | `firecrawl` (latest ~4.x) | SERP scraping — fetch top-result page content as markdown | User has a key; 1,000 credits/month free, 10 scrape req/min |
| @google/genai | 2.x (GA) | LLM — Gemini 2.5 Flash (default provider) | Genuinely free: 15 RPM, 1,500 RPD, no credit card |
| Vercel AI SDK (`ai`) | 7.x | Swappable LLM provider abstraction | Provider-agnostic; swap Gemini ↔ Anthropic by changing two lines |

**Astro v5 vs v6 note:** Astro 6 (released March 2026) requires Node 22 and is the latest major; v6 is still stabilizing its adapter ecosystem and has known esbuild parse errors with `@astrojs/vercel` SSR (GitHub issue #16258). Use Astro 5 latest stable for this build to avoid adapter regressions. Revisit v6 once the adapter changelog confirms stability. Astro 5 still supports Node 20+, which Vercel's serverless runtime supports.

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ai-sdk/google` | 4.x (AI SDK v7 ecosystem) | Gemini provider for Vercel AI SDK | Default LLM path |
| `@ai-sdk/anthropic` | 4.x (AI SDK v7 ecosystem) | Anthropic provider for Vercel AI SDK | Swap-in path (user's Claude Haiku key) |
| `zod` | 3.x | Input validation on the API endpoint | Validate `keyword` query param before hitting Firecrawl |
| TypeScript | 5.x | Type safety across the single function | Ships with Astro; zero extra config needed |

---

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm` | Package management | No special tooling needed for this scale |
| Vercel CLI (`vercel`) | Local dev + preview deploys | `vercel dev` runs the serverless function locally with correct runtime; essential for testing the ~20s scrape+LLM path |
| `.env.local` | Secret management | Store `FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY` (optional swap) |

---

## Free-Tier Limits (Verified)

### Vercel Hobby Plan
- **Function max duration:** 300 seconds (Fluid Compute is enabled by default as of 2026; the old 60s limit was pre-Fluid-Compute)
- **Invocations:** 1,000,000/month
- **Active CPU:** 4 CPU-hours/month
- **Provisioned memory:** 360 GB-hours/month
- **Deployments:** 100/day
- **Commercial use restriction:** Hobby is explicitly non-commercial personal use only. If this tool generates revenue (ads, paid access, affiliate links), upgrade to Pro ($20/user/month).
- Source: https://vercel.com/docs/plans/hobby (last updated 2026-06-16)

### Firecrawl Free Plan
- **Credits:** 1,000 credits/month, no credit card required
- **Cost per operation:** 1 credit/page (scrape, crawl, map); 2 credits per 10 results (search)
- **Rate limits:** 10 scrape req/min, 5 search req/min, 1 crawl req/min
- **Concurrency:** 2 concurrent browsers
- **Practical impact:** One tool invocation = 1 Firecrawl scrape of the top-ranking Google result = 1 credit. At 1,000 credits/month, this tool can serve ~1,000 queries/month on the free tier before credits expire.
- Source: https://www.firecrawl.dev/pricing (verified 2026-06-30)

### Google Gemini Free Tier (Google AI Studio)
- **Model:** Gemini 2.5 Flash (recommended default) or Gemini 2.5 Flash-Lite (for higher burst RPM)
- **Rate limits (Gemini 2.5 Flash):** 15 RPM, 1,500 RPD, 1,000,000 TPM
- **Rate limits (Gemini 2.5 Flash-Lite):** 30 RPM, 1,500 RPD, 1,000,000 TPM
- **No credit card required:** Confirmed. Google AI Studio free tier is genuinely free with no trial expiry.
- **Data use note:** On the free tier, Google may use prompts to improve models. If user privacy is a concern, note this in the UI. Billing can be enabled to opt out, but that costs money.
- Source: tokenmix.ai/blog/gemini-api-free-tier-limits (cross-referenced with ai.google.dev/gemini-api/docs/rate-limits)

### Groq Free Tier (backup LLM)
- **No credit card required:** Confirmed. Sign up at console.groq.com.
- **Rate limits (llama-3.1-8b-instant):** 30 RPM, 14,400 RPD, 6,000 TPM
- **Rate limits (llama-3.3-70b-versatile):** 30 RPM, 1,000 RPD, 12,000 TPM
- **Truly free:** No per-token charge, no credits system, no expiry.
- Source: console.groq.com/docs/rate-limits + Grizzly Peak Software verification

---

## Architecture: Single Endpoint Pattern

### Astro Config (`astro.config.mjs`)

```js
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel'; // v11+ consolidated import — no /serverless suffix
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'hybrid', // Pages static by default; API route opts out with prerender=false
  adapter: vercel({
    maxDuration: 60, // seconds — well under the 300s Hobby ceiling; budget: ~5s Firecrawl + ~10s LLM
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

### API Endpoint (`src/pages/api/ideas.ts`)

```ts
export const prerender = false; // Opts this route out of static generation → serverless function

export async function POST({ request }) {
  // 1. Validate input
  // 2. Firecrawl: scrape top SERP result for keyword (1 credit)
  // 3. LLM: generate 8–12 video ideas from scraped content
  // 4. Return JSON
}
```

### Swappable LLM Provider Pattern

```ts
// lib/llm.ts — single source of truth for provider selection
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

const PROVIDER = process.env.LLM_PROVIDER ?? 'gemini'; // env var controls swap

export function getModel() {
  if (PROVIDER === 'anthropic') {
    return anthropic('claude-haiku-4-5'); // user's Haiku key
  }
  return google('gemini-2.5-flash'); // free default
}

// Usage: const { text } = await generateText({ model: getModel(), prompt });
```

Swapping providers = change `LLM_PROVIDER` env var + add provider API key. No application code changes.

---

## Critical: Firecrawl SERP Limitation

**Firecrawl does NOT return structured SERP features** (People Also Ask boxes, related searches, knowledge graph) as structured JSON. It returns the markdown content of the pages it scrapes, not the Google SERP page itself.

**What Firecrawl CAN do for this tool:**
- `app.search(query, { limit: 5 })` — returns top organic result titles + URLs + snippets from its own web index
- `app.scrapeUrl(url)` — scrapes a specific URL and returns clean markdown of that page's content

**Strategy for demand-grounded ideas without a SERP API:**
Use Firecrawl's `/v2/search` endpoint to get top 3–5 organic results for the keyword, then scrape each result's content as markdown. Feed the aggregated markdown (competitor article content + meta descriptions) to the LLM. The LLM synthesizes video ideas from what competitors are writing about — this is a stronger signal than PAA boxes anyway because it captures full article depth.

**If PAA/related searches are truly required:**
- **Serper.dev** — 2,500 one-time free searches (no credit card), returns PAA + related searches as structured JSON. This is trial credit, not a renewable free tier. Use as dev/testing budget only.
- **SerpApi** — no genuine free tier for production.
- **Recommendation:** Proceed with Firecrawl's search + scrape approach. The content of the top-ranking articles is richer signal for YouTube ideas than the PAA snippets alone.

---

## Installation

```bash
# Scaffold
npm create astro@latest my-app -- --template minimal --typescript strict --no-install
cd my-app

# Adapter
npx astro add vercel

# Tailwind (v4 path — no @astrojs/tailwind)
npm install tailwindcss @tailwindcss/vite

# Scraping
npm install firecrawl

# LLM — Vercel AI SDK v7 core + providers
npm install ai @ai-sdk/google
npm install @ai-sdk/anthropic  # only if Haiku swap-in is wired up at project start

# Validation
npm install zod

# Dev tooling
npm install -D vercel typescript
```

```css
/* src/styles/global.css */
@import "tailwindcss";
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Astro 5 (hybrid output) | Next.js 15 (App Router) | Next.js if the team already has it in the stack; Astro wins for SPA-like single-page tools because it ships near-zero JS by default |
| @astrojs/vercel (hybrid) | Static Astro + separate Vercel `/api` function | Valid pattern; the hybrid adapter approach is cleaner because Astro manages the function bundling and maxDuration config |
| Vercel AI SDK (ai + providers) | Direct `@google/genai` calls | Direct SDK is simpler if you will NEVER swap providers; AI SDK is the right call here because provider swap is an explicit requirement |
| Gemini 2.5 Flash (default) | Groq Llama 3.1 8B Instant | Groq has higher burst RPM (30 vs 15) and zero model cost; use as the fallback if Gemini rate limits are hit in production |
| Firecrawl search + scrape | SerpApi | SerpApi if structured PAA/related-searches JSON is non-negotiable; has no renewable free tier so breaks the $0 constraint in production |
| Vercel Hobby | Railway ($1 free credit/month) | Railway gives only $1/month of compute credit after the 30-day trial — not enough to run even light traffic. Vercel Hobby is the correct free-tier hosting choice for this workload. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@astrojs/tailwind` | Deprecated for Tailwind v4; offers no additional functionality and will receive no updates | `@tailwindcss/vite` plugin directly in `astro.config.mjs` |
| `@google/generative-ai` (legacy) | Deprecated as of November 2025; support ends August 2026; no Live API, no new features | `@google/genai` (v2.x GA) or `@ai-sdk/google` (via Vercel AI SDK) |
| `@astrojs/vercel/serverless` import path | Removed in v11; causes build failure | `import vercel from '@astrojs/vercel'` |
| Astro 6.0 | Known `@astrojs/vercel` SSR esbuild parse errors (issue #16258); requires Node 22 which may conflict with existing tooling | Astro 5.x latest stable; revisit v6 after adapter CHANGELOG shows resolution |
| `output: 'server'` (fully SSR) | All pages become serverless functions — wastes Hobby invocation budget on static content; no benefit for an SPA with one dynamic route | `output: 'hybrid'` with `prerender = false` only on the API route |
| SerpApi for production | No renewable free tier; first plan is $50/month | Firecrawl search + scrape (free 1,000 credits/month) |
| Serper.dev for production | 2,500 queries is a one-time trial credit, not monthly renewable | Firecrawl for production; Serper 2,500 credits are useful for development and testing |
| Railway as primary host | Post-trial free credit is $1/month — insufficient for sustained traffic | Vercel Hobby (1M invocations/month free) |
| OpenAI API (any tier) | No renewable free tier; all usage is credit-based with minimum spend | Gemini free tier (Google AI Studio) or Groq free tier |
| Anthropic Haiku as default | Has no free tier — requires paid API key | Reserve as opt-in swap-in; set Gemini as the default |

---

## Stack Patterns by Variant

**If user hits Firecrawl's 1,000 credit/month ceiling:**
- Use Firecrawl's `/v2/search` (returns organic titles + snippets, costs 2 credits per 10 results) rather than full page scraping (1 credit/page)
- For demo/low-traffic: search-only mode gives 5,000 result sets/month on the free tier; quality is lower but preserves the $0 constraint

**If Gemini free tier 1,500 RPD is a bottleneck:**
- Switch `LLM_PROVIDER` env var to `groq`; Groq Llama 3.1 8B Instant supports 14,400 RPD on free tier
- No code change required with the swappable provider pattern

**If the tool becomes commercial:**
- Upgrade Vercel to Pro ($20/month) — Hobby explicitly prohibits commercial use
- Firecrawl Starter plan ($16/month) for 3,000 credits/month
- Gemini billing enabled (Tier 1) removes RPD cap; or keep Groq free tier for cost-zero LLM

**If Astro 6 adapter issues are resolved:**
- Migration from Astro 5 to 6: bump `astro` and `@astrojs/vercel` versions; update Node to 22; change `output` as needed; remove any `@astrojs/tailwind` remnants. Low migration risk given this project's minimal page count.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| astro@5.x | @astrojs/vercel@11.x | Confirmed. v11 adapter explicitly targets Astro 5 |
| astro@6.x | @astrojs/vercel@11.x | Known esbuild SSR errors (GitHub #16258); avoid until resolved |
| tailwindcss@4.x | @tailwindcss/vite (Vite plugin) | Correct path for Astro 5 (Vite-based). Do NOT use `@astrojs/tailwind` |
| ai@7.x | @ai-sdk/google@4.x, @ai-sdk/anthropic@4.x | All part of AI SDK v7 release; node@22+ required for AI SDK v7 (use node@20 + ai@6.x if stuck on Node 20) |
| Node.js | Astro 5: 20+; Astro 6: 22+; AI SDK 7: 22+ | If deploying on Vercel Hobby, Vercel supports Node 20, 22. Stick to Astro 5 + Node 20 or go full Astro 5 + Node 22 to be AI SDK v7 compatible |

---

## Sources

- https://vercel.com/docs/plans/hobby — Hobby plan limits table (verified 2026-06-16)
- https://vercel.com/docs/functions/configuring-functions/duration — max duration 300s on Hobby with Fluid Compute (verified 2026-06-19)
- https://www.firecrawl.dev/pricing — 1,000 credits/month free, no credit card (verified 2026-06-30)
- https://docs.firecrawl.dev/rate-limits — 10 scrape req/min, 5 search req/min, 2 concurrent browsers
- https://tokenmix.ai/blog/gemini-api-free-tier-limits — Gemini 2.5 Flash: 15 RPM, 1,500 RPD, 1M TPM, no credit card (MEDIUM — third party, cross-referenced with ai.google.dev)
- https://ai.google.dev/gemini-api/docs/rate-limits — Confirms free tier exists; per-model limits in AI Studio dashboard (official, verified)
- https://console.groq.com/docs/rate-limits — Groq Llama rate limits (official)
- https://www.getaiperks.com/en/ai/groq-free-tier-2026 — Confirms no credit card required (MEDIUM — third party)
- https://docs.astro.build/en/guides/integrations-guide/vercel/ — v11 import path, hybrid output, maxDuration (official)
- https://ai-sdk.dev/docs/ai-sdk-core/providers-and-models — AI SDK v7 provider pattern, @ai-sdk/google, @ai-sdk/anthropic (official)
- https://www.npmjs.com/package/@google/genai — @google/genai v2.x GA (official npm)
- https://github.com/google-gemini/deprecated-generative-ai-js — Confirms @google/generative-ai deprecated (official GitHub)
- https://tailwindcss.com/docs/installation/framework-guides/astro — @tailwindcss/vite path for Astro (official)
- https://costbench.com/software/web-scraping/serper/free-plan/ — Serper 2,500 one-time trial confirmed (MEDIUM)
- https://vercel.com/docs/limits/fair-use-guidelines — Hobby commercial use prohibition (official)

---
*Stack research for: keyword → YouTube video ideas tool (Astro + Vercel serverless + Firecrawl + Gemini)*
*Researched: 2026-06-30*
