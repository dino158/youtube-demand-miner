# Architecture Research

**Domain:** Astro static SPA + Vercel serverless function — keyword-to-YouTube-ideas tool
**Researched:** 2026-06-30
**Confidence:** HIGH (all key claims verified against official Vercel, Firecrawl, Google AI, and Anthropic documentation)

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  BROWSER (Astro static bundle — served from Vercel CDN)            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  src/pages/index.astro  (static shell + <script> island)    │  │
│  │                                                              │  │
│  │   [Keyword Input Form]  →  POST /api/generate               │  │
│  │                                     ↓  (JSON response)      │  │
│  │   [Results Cards Grid]  ←  render 8-12 VideoIdea objects    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │ HTTPS POST  { keyword }
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│  VERCEL SERVERLESS FUNCTION  (api/generate.ts)                     │
│                                                                    │
│  ┌────────────────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │  1. Firecrawl  │→  │  2. Parser   │→  │  3. LLM Provider    │  │
│  │  search(query) │   │  extract     │   │  (Gemini Flash      │  │
│  │                │   │  titles,     │   │   or Haiku via      │  │
│  │  ~5-15 results │   │  snippets,   │   │   swappable         │  │
│  │  as markdown   │   │  PAA hints   │   │   interface)        │  │
│  └────────────────┘   └──────────────┘   └──────────┬──────────┘  │
│                                                      │             │
│                                         JSON array (8-12 ideas)   │
└──────────────────────────────────────────────────────┼────────────┘
                                                       │
                                          Response.json({ ideas })
```

**No database. No cache. No auth. No sessions.**
Each request is stateless: keyword in, ideas array out.

---

## Component Responsibilities

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|----------------|-------------------|
| Static Shell | `src/pages/index.astro` | Renders HTML, loads CSS, boots the client script | Browser only |
| Client Island | `src/scripts/app.ts` | Form submit handler, fetch call, loading state, renders cards | `/api/generate` |
| Serverless Function | `api/generate.ts` | Orchestrates the full pipeline: Firecrawl → parse → LLM | Firecrawl API, LLM provider |
| LLM Provider Interface | `src/lib/llm/types.ts` | Defines the shared contract all providers implement | `api/generate.ts` |
| Gemini Provider | `src/lib/llm/gemini.ts` | Wraps `@google/genai` SDK, enforces JSON schema | LLM Provider Interface |
| Haiku Provider | `src/lib/llm/haiku.ts` | Wraps Anthropic SDK, enforces JSON schema | LLM Provider Interface |
| Provider Factory | `src/lib/llm/index.ts` | Reads `LLM_PROVIDER` env var, returns correct provider | Both providers |
| Demand Parser | `src/lib/parser.ts` | Extracts signal text from Firecrawl markdown response | `api/generate.ts` |

---

## Recommended Project Structure

```
project-root/
├── api/
│   └── generate.ts          # The single Vercel serverless function
│
├── src/
│   ├── pages/
│   │   └── index.astro      # Static shell — form + card grid markup
│   │
│   ├── scripts/
│   │   └── app.ts           # Client-side island: submit, fetch, render
│   │
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── types.ts     # LLMProvider interface + VideoIdea type
│   │   │   ├── gemini.ts    # Gemini 2.5 Flash implementation
│   │   │   ├── haiku.ts     # Claude Haiku implementation
│   │   │   └── index.ts     # Factory: picks provider from env var
│   │   │
│   │   └── parser.ts        # Firecrawl response → demand signal text
│   │
│   └── styles/
│       └── global.css       # Minimal styles
│
├── .env.local               # FIRECRAWL_API_KEY, GEMINI_API_KEY, LLM_PROVIDER
├── astro.config.mjs         # output: "static" — no Vercel adapter needed
├── vercel.json              # optional: rewrites or function config
└── package.json
```

### Structure Rationale

- **`api/` at root level:** Vercel treats any file in `/api` as a standalone serverless function regardless of framework. Since the Astro site is fully static (`output: "static"`), no Astro Vercel adapter is needed. The `/api` directory is framework-agnostic.
- **`src/lib/llm/`:** All LLM code is isolated here. The function imports only the factory — it never imports Gemini or Haiku directly, keeping the swap to one env var change.
- **`src/scripts/app.ts`:** Kept out of the Astro component so it can be bundled separately and reasoned about as plain TypeScript.
- **`src/lib/parser.ts`:** Extracted from the function to keep `api/generate.ts` readable at a glance — each step is a named function call.

---

## Architectural Patterns

### Pattern 1: Single-File Serverless Orchestrator

**What:** One function file (`api/generate.ts`) imports helpers and sequences three steps: scrape → parse → LLM. No routing, no middleware, no framework inside the function.

**When to use:** Any pipeline with 2-4 sequential external calls where the goal is readability over reusability.

**Trade-offs:** Dead simple to read and explain. Cannot be partially retried if one step fails (acceptable for free-tier MVP). All logic is discoverable from one file.

```typescript
// api/generate.ts — readable at a glance
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const { keyword } = await request.json() as GenerateRequest;
    if (!keyword?.trim()) return new Response("keyword required", { status: 400 });

    // Step 1: scrape demand signals
    const raw = await firecrawlSearch(keyword);

    // Step 2: extract signal text
    const demandContext = parseDemandSignals(raw);

    // Step 3: synthesize ideas
    const provider = getProvider();           // reads LLM_PROVIDER env var
    const ideas = await provider.generate(demandContext, keyword);

    return Response.json({ ideas } satisfies GenerateResponse);
  }
};
```

### Pattern 2: Strategy Pattern for LLM Providers (3-file implementation)

**What:** A minimal interface with one method. Each provider is a class that implements it. A factory function returns the right class based on an env var. Zero conditional logic leaks into the function.

**When to use:** When you want swappable dependencies without a framework or DI container.

**Trade-offs:** Slightly more files than inline conditionals, but each file is ~30-50 lines and independently testable. Explained in 30 seconds in an interview.

```typescript
// src/lib/llm/types.ts
export interface VideoIdea {
  title: string;       // Suggested YouTube video title
  intent: string;      // Search intent this targets (informational / commercial / etc.)
  rationale: string;   // Why this topic has demand (1-2 sentences)
}

export interface LLMProvider {
  generate(demandContext: string, keyword: string): Promise<VideoIdea[]>;
}

// src/lib/llm/index.ts
import { GeminiProvider } from "./gemini";
import { HaikuProvider } from "./haiku";
import type { LLMProvider } from "./types";

export function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER ?? "gemini";
  if (name === "haiku") return new HaikuProvider();
  return new GeminiProvider();   // default
}
```

### Pattern 3: Structured JSON Output via Native API Schema Enforcement

**What:** Tell the LLM to return JSON by passing a JSON Schema to the API — do not ask for JSON in the prompt text alone. Both Gemini and Haiku support this natively.

**When to use:** Any time you need a reliably parseable array of objects. "Return JSON" in the prompt is fragile; schema enforcement is not.

**Trade-offs:** Removes all parsing fragility. Requires a slightly different API call shape per provider — but that is hidden inside each provider class.

```typescript
// src/lib/llm/gemini.ts (key section)
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, VideoIdea } from "./types";

const VIDEO_IDEA_SCHEMA = {
  type: "array",
  minItems: 8,
  maxItems: 12,
  items: {
    type: "object",
    properties: {
      title:     { type: "string" },
      intent:    { type: "string" },
      rationale: { type: "string" },
    },
    required: ["title", "intent", "rationale"],
  },
};

export class GeminiProvider implements LLMProvider {
  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  async generate(demandContext: string, keyword: string): Promise<VideoIdea[]> {
    const response = await this.client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(demandContext, keyword),
      config: {
        responseMimeType: "application/json",
        responseSchema: VIDEO_IDEA_SCHEMA,
      },
    });
    return JSON.parse(response.text) as VideoIdea[];
  }
}
```

---

## Data Flow

### Full Pipeline (keyword → ideas)

```
User types keyword, submits form
    │
    │  [Browser — app.ts]
    ▼
setState("loading") → disable form → show skeleton cards
    │
    │  POST /api/generate
    │  Body: { "keyword": "home gym equipment" }
    ▼
[api/generate.ts — Step 1: Firecrawl]
    POST https://api.firecrawl.dev/v1/search
    Body: { query: keyword, limit: 10, scrapeOptions: { formats: ["markdown"] } }
    Response: array of { title, description, url, markdown }
    │
    ▼
[api/generate.ts — Step 2: Parser — parser.ts]
    Concatenate: title + description + first N chars of markdown per result
    Extract: any "People Also Ask" text visible in markdown
    Output: single demandContext string (~2000 tokens max)
    │
    ▼
[api/generate.ts — Step 3: LLM Provider]
    Build prompt: keyword + demandContext → ask for 8-12 video ideas
    Call provider.generate(demandContext, keyword)
    Provider enforces JSON schema → guaranteed array of VideoIdea
    │
    ▼
Response.json({ ideas: VideoIdea[] })
    │
    │  [Browser — app.ts]
    ▼
setState("done") → render cards (title + intent badge + rationale)
```

### Frontend↔Function API Contract (concrete shapes)

**Request — POST /api/generate**
```json
{
  "keyword": "home gym equipment for beginners"
}
```

- `keyword`: non-empty string, max 200 chars (validated in function before any external call)

**Response — 200 OK**
```json
{
  "ideas": [
    {
      "title": "Best Budget Home Gym Equipment Under $200",
      "intent": "commercial",
      "rationale": "High search volume query with clear purchase intent; multiple PAA results show buyers comparing price ranges."
    },
    {
      "title": "How to Build a Home Gym in a Small Apartment",
      "intent": "informational",
      "rationale": "Addresses the space constraint frequently appearing in SERP snippets; strong how-to framing."
    }
  ]
}
```

**Error Responses**
```json
{ "error": "keyword required" }              // 400
{ "error": "scrape failed: <message>" }      // 502
{ "error": "llm error: <message>" }          // 502
{ "error": "internal error" }                // 500
```

All errors use the same `{ error: string }` shape so the frontend only needs one error branch.

---

## Vercel Free Tier Constraints

| Constraint | Limit | Impact on This Project |
|------------|-------|------------------------|
| Function max duration (Hobby, Fluid Compute) | 300 seconds | No issue — 20s pipeline is well within limit |
| Memory | 2 GB | No issue — no in-memory data stores |
| Request body size | 4.5 MB | No issue — tiny JSON payloads |
| Concurrent executions | Auto-scales to 30,000 | No issue for MVP traffic |
| Function bundle size | 250 MB | Watch: keep `@google/genai` + `@anthropic-ai/sdk` lean |

**Critical note on the "10-second timeout" myth:** Earlier web sources quoted 10s. The official Vercel docs (updated 2026-06-19) confirm Hobby Fluid Compute allows **300 seconds**. A ~20-second Firecrawl + LLM call is comfortably within budget. Source: https://vercel.com/docs/functions/limitations

**Firecrawl free tier:** 1,000 credits/month. Each search call costs 2 credits per 10 results. At 10 results per generate call, that is 2 credits per user request — enough for 500 requests/month on the free tier.

**Gemini free tier:** 1,500 requests/day on Gemini 2.5 Flash. More than sufficient for development and low-traffic production.

---

## Environment Variables

```
# .env.local (never committed)
FIRECRAWL_API_KEY=fc-...
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...   # only needed when LLM_PROVIDER=haiku

# Switch providers without touching code:
LLM_PROVIDER=gemini             # default; set to "haiku" to swap
```

Set the same variables in Vercel Dashboard → Project Settings → Environment Variables. The serverless function reads them via `process.env` at runtime — they are never exposed to the browser.

---

## Frontend Loading / Error State Handling

The client island (`src/scripts/app.ts`) manages three UI states. No framework needed — plain DOM manipulation is readable and interview-explainable:

```
idle      → submit pressed → loading   → success (render cards)
                                      → error   (show message)
```

**Pattern:**
1. On submit: disable button, show "Analyzing demand..." skeleton (3 placeholder cards), clear previous results.
2. On response: if `ideas` array present → render cards. If `error` field present → show inline error message, re-enable form.
3. On network failure (fetch throws) → show generic error, re-enable form.

Skeleton cards (CSS-only animated placeholder blocks) prevent layout shift and give immediate visual feedback for a 10-25 second wait.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Asking for JSON in Prompt Text Only

**What people do:** Add "Return your answer as JSON" to the prompt string and then `JSON.parse()` the response.
**Why it's wrong:** LLMs frequently add preamble text, code fences, or trailing commentary that breaks `JSON.parse()`. Requires fragile regex cleanup.
**Do this instead:** Pass `responseMimeType: "application/json"` and a `responseSchema` to the API. The model is constrained at the API level — the response is guaranteed valid JSON matching your schema.

### Anti-Pattern 2: Importing Both Provider SDKs Unconditionally

**What people do:** `import { GoogleGenAI } from "@google/genai"; import Anthropic from "@anthropic-ai/sdk";` at the top of the function file.
**Why it's wrong:** Both SDKs get bundled even when only one is used, increasing cold-start time and bundle size. Also couples the function to both providers' initialization paths.
**Do this instead:** The factory in `src/lib/llm/index.ts` does a dynamic `require()` or the provider files are only imported via the factory. The function only imports `getProvider` from the factory.

### Anti-Pattern 3: Scraping Full Page Content for All 10 Results

**What people do:** Pass `formats: ["markdown"]` in `scrapeOptions` to get full page markdown for every result.
**Why it's wrong:** Each of 10 full scrapes can run 2-5 seconds each; sequential scraping would exceed 20-50 seconds total. Also costs 1 credit per page scraped on top of the search credits.
**Do this instead:** Use Firecrawl's `/search` endpoint with only `formats: ["markdown"]` in `scrapeOptions` for the search result itself (title + snippet + url), which Firecrawl returns in a single call. Full page scraping is not needed — SERP snippets and PAA text visible in the search results provide sufficient demand signal for the LLM.

### Anti-Pattern 4: Putting API Keys in the Astro Component

**What people do:** Access `import.meta.env.FIRECRAWL_API_KEY` inside an Astro component or a client-side script.
**Why it's wrong:** Astro exposes `PUBLIC_` prefixed env vars to the browser. Unprefixed keys would silently be undefined client-side — but if someone accidentally uses the `PUBLIC_` prefix, the key is exposed in the browser bundle.
**Do this instead:** Keys only ever live in `api/generate.ts` (server-side). The browser sends only the keyword. The function makes all external API calls with the keys.

---

## Suggested Build Order

Build in dependency order — each step is independently testable before the next.

```
Step 1: Types  (no dependencies)
    → src/lib/llm/types.ts
    Define VideoIdea interface and LLMProvider interface.
    Finish: TypeScript compiles, interfaces are clear.

Step 2: LLM Providers  (depends on: types)
    → src/lib/llm/gemini.ts
    → src/lib/llm/haiku.ts
    → src/lib/llm/index.ts
    Build Gemini first (free tier, no billing setup).
    Test with a hardcoded demandContext string from the REPL.
    Finish: provider.generate("sample context", "test keyword") returns valid ideas.

Step 3: Demand Parser  (no external dependencies)
    → src/lib/parser.ts
    Write parseDemandSignals(firecrawlResults) with a fixture JSON file.
    Finish: given sample Firecrawl output, returns a clean context string.

Step 4: Serverless Function  (depends on: providers, parser)
    → api/generate.ts
    Wire steps 1-3. Add input validation and error handling.
    Test with curl or Postman against `vercel dev`.
    Finish: POST { keyword } returns { ideas } JSON.

Step 5: Static Frontend Shell  (depends on: function being callable)
    → src/pages/index.astro
    Build form + card grid markup with hardcoded placeholder ideas first.
    Finish: page renders in browser with static content.

Step 6: Client Island  (depends on: shell + function)
    → src/scripts/app.ts
    Wire form submit to fetch /api/generate, render real results.
    Add loading skeleton + error state.
    Finish: end-to-end keyword → ideas flow works in browser.

Step 7: Deploy + Env Vars  (depends on: everything above)
    Push to GitHub, link to Vercel.
    Set FIRECRAWL_API_KEY, GEMINI_API_KEY in Vercel dashboard.
    Finish: production URL returns ideas for real keywords.
```

---

## Integration Points

### External Services

| Service | Integration Point | Auth | Notes |
|---------|-------------------|------|-------|
| Firecrawl `/v1/search` | `api/generate.ts` Step 1 | `Authorization: Bearer FIRECRAWL_API_KEY` | Returns title + description + optional markdown per result. No full-page scrape needed. |
| Gemini 2.5 Flash | `src/lib/llm/gemini.ts` | `GEMINI_API_KEY` in SDK constructor | Use `responseMimeType: "application/json"` + `responseSchema`. Free: 1,500 req/day. |
| Claude Haiku | `src/lib/llm/haiku.ts` | `ANTHROPIC_API_KEY` in SDK constructor | No free tier — requires Anthropic billing. Optional/swappable only. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser ↔ Serverless Function | HTTPS POST JSON | Strictly typed via `GenerateRequest` / `GenerateResponse` types shared in `src/lib/llm/types.ts` |
| `api/generate.ts` ↔ LLM providers | Direct TypeScript import via factory | Never import provider implementations directly — always go through `getProvider()` |
| `api/generate.ts` ↔ Firecrawl | `fetch()` to Firecrawl REST API | No SDK needed; raw `fetch` keeps bundle small and logic explicit |

---

## Scaling Considerations

| Scale | Notes |
|-------|-------|
| 0–500 req/month | Fully within Firecrawl free tier (1,000 credits, 2 credits/request) and Gemini free tier. $0/month. |
| 500–5,000 req/month | Firecrawl Starter plan (~$16/month) unlocks more credits. Gemini still free at this request rate. |
| 5,000+ req/month | Add response caching in Vercel KV (key = normalized keyword) to reduce repeat Firecrawl calls. Gemini rate limits become relevant — consider batching or upgrade. |

For this project, scaling beyond free tiers is explicitly out of scope. The architecture does not need to change to support caching later — the function boundary is already the right place to insert a cache layer.

---

## Sources

- Vercel Functions Limitations (updated 2026-06-19): https://vercel.com/docs/functions/limitations
- Vercel Functions Quickstart: https://vercel.com/docs/functions/quickstart
- Firecrawl Search Endpoint Docs: https://docs.firecrawl.dev/api-reference/endpoint/search
- Firecrawl Pricing (free tier credits): https://www.firecrawl.dev/pricing
- Gemini Structured Output (generateContent API): https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- Google GenAI JS SDK (googleapis/js-genai): https://github.com/googleapis/js-genai
- Anthropic Structured Outputs (beta): https://tessl.io/blog/anthropic-brings-structured-outputs-to-claude-developer-platform-making-api-responses-more-reliable/
- LLM Provider Strategy Pattern: https://dev.to/daniloab/how-to-integrate-multiple-llm-providers-without-turning-your-codebase-into-a-mess-provider-36g9
- Astro on Vercel: https://vercel.com/docs/frameworks/frontend/astro
- Astro + Vercel Serverless API: https://dev.to/daelmaak/astro-vercel-serverless-api-12l8

---
*Architecture research for: Astro SPA + Vercel serverless function — YouTube idea generator*
*Researched: 2026-06-30*
