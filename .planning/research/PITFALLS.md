# Pitfalls Research

**Domain:** Free-tier AI pipeline — Astro + Vercel serverless + Firecrawl SERP scraping + free LLM (Gemini)
**Researched:** 2026-06-30
**Confidence:** HIGH (Vercel/Firecrawl/Gemini limits verified via official docs; SERP scraping behavior via multiple community sources)

---

## Critical Pitfalls

### Pitfall 1: Vercel Hobby Timeout — The Pipeline Exceeds the Default

**What goes wrong:**
A single serverless function that calls Firecrawl (scrape + search) and then an LLM can easily take 15–25 seconds end-to-end. Vercel Hobby's Fluid Compute default is 300 seconds *maximum*, but the **old 10-second default** is still widely documented in tutorials, and some project configurations still emit `maxDuration: 10` if the `vercel.json` is scaffolded from an older template. If `maxDuration` is not explicitly set or Fluid Compute is not enabled for the project, the function will 504 timeout mid-pipeline.

**Why it happens:**
Fluid Compute (enabled by default for **new** projects only) raised the Hobby ceiling to 300 seconds. Projects migrated from older scaffolds, or projects that explicitly set `maxDuration: 10` from Stack Overflow/tutorial copy-paste, will still time out at 10 seconds. Additionally, the Firecrawl `/search` endpoint and the LLM call are sequential by default — no parallelism — so latency stacks.

**How to avoid:**
- Verify Fluid Compute is enabled in Vercel project settings (Dashboard > Project > Settings > Functions > Fluid Compute toggle).
- In `vercel.json`, set `maxDuration: 60` on the API function explicitly — this removes ambiguity regardless of project age:
  ```json
  {
    "functions": {
      "src/pages/api/generate.ts": { "maxDuration": 60 }
    }
  }
  ```
- Design the function to emit a streaming response (SSE or chunked transfer) so the browser perceives progress before the full 20s completes, avoiding the user-facing perception of a hang even if server execution is within limits.
- Profile locally with `time curl` to establish baseline before deploying — if local takes 18s, budget for cold-start overhead on first invocation.

**Warning signs:**
- `FUNCTION_INVOCATION_TIMEOUT` errors in Vercel runtime logs.
- 504 responses from the API route that work fine locally with `wrangler dev` or `astro dev`.
- Vercel dashboard showing function duration capped at exactly 10.0s.

**Phase to address:** Phase 1 (infrastructure/scaffold setup) — configure `vercel.json` before writing any pipeline logic.

---

### Pitfall 2: Firecrawl Does Not Extract Structured SERP Features (PAA, Related Searches)

**What goes wrong:**
Firecrawl's `/search` endpoint returns URLs, titles, and description snippets — it does **not** return structured Google SERP objects like People Also Ask boxes, featured snippets, Knowledge Graphs, or related-search carousels as discrete JSON fields. If the plan is to use those PAA questions as YouTube idea seeds, Firecrawl alone cannot deliver them without a secondary scrape of the raw Google HTML, which Google aggressively blocks.

**Why it happens:**
Firecrawl is designed for full-page content extraction from arbitrary URLs, not SERP feature parsing. SERP-specific features (PAA, related searches) require either a dedicated SERP API (SerpApi, ValueSERP, DataForSEO) or scraping raw Google results — the latter is blocked by Google's bot detection on datacenter IPs including Firecrawl's cloud infrastructure.

**How to avoid:**
- Re-scope the product: instead of "extract PAA/related searches from Google," use Firecrawl's `/search` to return the **top organic results** for a query, scrape those pages, and send that content to the LLM to infer YouTube ideas. This is reliable with Firecrawl.
- If PAA data is truly required, plan for a free-tier SerpApi key (100 searches/month free) as an alternative or fallback endpoint, not Firecrawl.
- On the free SerpApi tier: cache results aggressively in `localStorage` or `sessionStorage` on the client (no database needed) so repeat queries for the same keyword don't burn quota.

**Warning signs:**
- No `people_also_ask` or `related_searches` keys in Firecrawl search response JSON.
- LLM outputs generic ideas that don't reflect SERP-specific context — likely because the input was only title+description, not full page content.
- Developers trying to regex-parse `google.com` HTML through `firecrawl.scrape("https://www.google.com/search?q=...")` — this will return a blocked/captcha page, not search results.

**Phase to address:** Phase 1 (scope definition) — decide the data source before writing any pipeline code.

---

### Pitfall 3: Google Blocks Firecrawl When Scraping google.com Directly

**What goes wrong:**
Any attempt to pass `https://www.google.com/search?q=...` directly to Firecrawl's `/scrape` endpoint will either return a CAPTCHA page, a meta-refresh redirect, or a blocked response. Google requires JavaScript rendering, uses TLS fingerprinting, and flags datacenter IPs. This is not a configuration issue — it is a fundamental policy enforcement that Firecrawl's cloud infrastructure cannot bypass.

**Why it happens:**
Google's SERP is one of the most bot-protected pages on the internet. As of 2024–2026, Google serves JS-rendered pages that require a full browser execution context, performs behavioral analysis, and serves different content to known scraper IPs. Firecrawl gets blocked even with stealth mode enabled on these domains.

**How to avoid:**
- Never use Firecrawl to scrape `google.com` URLs. This is the single clearest rule in this stack.
- Use Firecrawl's own `/search` endpoint (which uses a separate search index, not Google) to find relevant pages, then scrape those pages.
- Alternatively, use the free Google Custom Search JSON API (100 queries/day free, returns structured JSON with PAA is not included but organic results are) — then pass result URLs to Firecrawl for content extraction.
- Accept the limitation: this tool generates ideas from web content around a keyword, not from Google's SERP features directly.

**Warning signs:**
- Firecrawl returns content containing "Before you continue to Google Search" or "Our systems have detected unusual traffic."
- Response `markdown` field is empty or contains only CAPTCHA-related text.
- `statusCode: 403` or `statusCode: 429` in the Firecrawl scrape response.

**Phase to address:** Phase 1 (architecture design) — document which URLs Firecrawl will and will not be called with.

---

### Pitfall 4: API Keys Leaking to the Client Bundle via Astro

**What goes wrong:**
In Astro, any environment variable prefixed with `PUBLIC_` is injected into the client-side JavaScript bundle and visible to anyone who opens DevTools. If a developer names their Firecrawl or Gemini API key `PUBLIC_FIRECRAWL_KEY` (a natural instinct when trying to debug why `import.meta.env.FIRECRAWL_KEY` returns `undefined` in a component), the key is shipped in plain text in the browser bundle. There is a documented GitHub issue (astro#3102) where secret keys can leak to the client unintentionally even without `PUBLIC_` if they are referenced in template expressions that the compiler inlines.

**Why it happens:**
Astro's environment variable security relies entirely on the naming convention (`PUBLIC_` prefix = client-safe, no prefix = server-only). Developers who are new to Astro frequently add `PUBLIC_` to stop `undefined` errors without understanding the security implication. The compiler does not warn or error when a non-`PUBLIC_` variable is used in client-side `<script>` tags or inline scripts.

**How to avoid:**
- Place ALL Firecrawl and Gemini API key access inside the Astro API endpoint file (`src/pages/api/generate.ts`) using `import.meta.env.FIRECRAWL_KEY` (no `PUBLIC_` prefix). Never reference them in `.astro` component files' `<script>` blocks or client-side imports.
- Use the `astro:env` module (Astro 4.10+) with `envField.string({ context: "server", access: "secret" })` — this enforces at the type-system level that the variable cannot be accessed in client code.
- Add a `.env.example` with placeholder values and commit it; add `.env` to `.gitignore` immediately when scaffolding — before the first `git add`.
- Run `grep -r "FIRECRAWL\|GEMINI" dist/` after every build to verify no keys appear in the output bundle.

**Warning signs:**
- `import.meta.env.FIRECRAWL_KEY` returns `undefined` in a `.astro` component's `<script>` tag — this is the moment developers reach for `PUBLIC_` prefix.
- Keys visible in browser DevTools > Sources when inspecting bundled JS files.
- `git log -p` shows `.env` in a previous commit.

**Phase to address:** Phase 1 (scaffold) — configure `astro:env` schema and `.gitignore` before writing any API integration code.

---

### Pitfall 5: Unguarded Public Endpoint — Free-Tier Exhaustion by Abuse or Bots

**What goes wrong:**
With no authentication and no rate limiting, a single bot or a shared link on Reddit/HackerNews can exhaust all free-tier resources within hours:
- Firecrawl free tier: **500–1,000 credits/month** (~10 scrape req/min). One viral day = months of quota gone.
- Gemini free tier: **1,500 RPD** at 15 RPM. A coordinated burst or crawler saturates this within minutes.
- Vercel Hobby: **1M function invocations/month** and **4 CPU-hours/month active compute**. While the invocation count is large, each pipeline invocation costs real CPU-hours and active compute time. Sustained abuse will exhaust the 4 CPU-hour allocation.
- When Vercel Hobby limits are exceeded, **traffic stops until the 30-day reset** — there is no graceful degradation.

**Why it happens:**
The "no auth" decision is deliberate for UX simplicity. But an unauthenticated, public API endpoint that calls paid external services on every request is an open resource drain. The endpoint URL is trivially discoverable from the page's network requests.

**How to avoid (all free, no database required):**
1. **IP-based rate limiting at the edge** — Vercel Hobby includes up to 3 WAF custom rules. Create a WAF rule to block requests to `/api/generate` exceeding N requests per minute from a single IP. Set N=5/min (generous for a human, blocking for a bot).
2. **Honeypot / simple proof-of-work** — Add a hidden form field that bots fill but humans don't. If it's filled, return a fake 200 without calling any external API.
3. **Client-side debouncing + minimum input length** — Enforce a minimum keyword length (4+ chars) and debounce the submit button (3s cooldown) in the UI. Trivial bots submit empty or single-char queries constantly.
4. **Hard budget cap with a feature flag** — Store a "service_enabled" flag in Vercel Edge Config (free, included in Hobby). When Firecrawl credits approach exhaustion, flip the flag to `false` via the Vercel dashboard — the API returns a 503 with a clear message rather than burning the last credits.
5. **Realistic consequence to document in build plan:** If none of the above is implemented and the app goes viral, all three external services (Firecrawl, Gemini, Vercel) can be exhausted within 24 hours. Recovery requires waiting for monthly resets — up to 30 days.

**Warning signs:**
- Vercel function invocation count spiking in the dashboard without corresponding organic usage.
- Firecrawl credit balance dropping faster than expected (check via Firecrawl dashboard).
- Gemini 429 errors appearing frequently despite low expected usage.
- Unusual traffic patterns in Vercel analytics: many short-interval requests from a small number of IPs.

**Phase to address:** Phase 1 (API endpoint setup) — WAF rule and debounce must be in place before any public deployment, even a soft launch.

---

### Pitfall 6: Gemini Free-Tier Quota Exhaustion and Silent Rate-Limit Failures

**What goes wrong:**
Gemini 2.5 Flash free tier is capped at **15 RPM and 1,500 RPD**. Google silently reduced free-tier quotas on December 7, 2025 without public announcement, breaking apps that had worked for months. A 429 `RESOURCE_EXHAUSTED` error is returned. If the serverless function does not handle 429s explicitly, it will surface as a generic 500 error to the user with no actionable message.

Additionally: if billing is enabled on a Google Cloud project, **the free tier disappears entirely** — every token becomes billable from the first call. This means enabling billing to "fix" a quota issue converts the $0 tool into a potentially costly one.

**Why it happens:**
- 15 RPM is plenty for a single user but inadequate under even modest concurrent load (5+ simultaneous requests will exceed it).
- Developers often enable billing thinking it gives "more quota" without realizing it removes the free tier.
- No retry logic = first 429 = opaque failure.

**How to avoid:**
- Implement exponential backoff with jitter (base 1s, max 30s, 3 retries) on all Gemini API calls within the serverless function.
- Never enable billing on the Google AI Studio project used for this app unless you add spend caps and understand the billing model.
- Use Gemini 2.5 Flash-Lite (more lenient quotas than 2.5 Flash, still free tier) for the primary path; fall back to a different free LLM (e.g., Groq's free tier for Llama 3) when Gemini returns 429.
- Surface Gemini 429s to the user as "The AI service is busy, try again in 30 seconds" rather than a generic error.
- Monitor RPD usage by logging request timestamps server-side to a lightweight counter (e.g., Vercel KV free tier has 30,000 requests/month — use it as a simple counter, or use `globalThis` in-process caching for warm instances).

**Warning signs:**
- HTTP 429 with body `{"error": {"code": 429, "message": "Resource has been exhausted"}}` in Vercel function logs.
- All requests failing after a traffic spike even though Firecrawl works fine — indicates Gemini quota hit, not Firecrawl.
- Zero responses on the hour mark (midnight Pacific) if the RPD cap was hit — Gemini resets daily quotas at midnight Pacific.

**Phase to address:** Phase 2 (LLM integration) — build retry logic and error surfacing before wiring to the UI.

---

### Pitfall 7: Unreliable Structured JSON from the LLM

**What goes wrong:**
Even with `responseSchema` set on Gemini, structured output is not 100% reliable. Common failure modes:
- The model wraps the JSON in a markdown code fence: ` ```json\n{...}\n``` ` — `JSON.parse()` throws.
- Keys are returned in a different order or with different casing than the schema defines.
- On long contexts (many scraped pages), the model truncates the output, returning malformed partial JSON.
- Schema mismatch: the schema says `ideas` is an array of strings, but the model returns an array of objects with `{title, description}`.

At a 5% JSON parse failure rate, across 20 users/day (300 requests) that's 15 broken requests per day — noticeable in a small tool.

**Why it happens:**
Gemini's JSON mode (`responseMimeType: "application/json"`) guarantees parseable JSON but not schema adherence. `responseSchema` significantly improves adherence but is not a hard constraint enforced server-side. Longer prompts with more scraped content increase the probability of schema drift.

**How to avoid:**
- Always use `responseSchema` + `responseMimeType: "application/json"` together — not just one.
- Wrap every `JSON.parse()` in a try/catch; if it fails, strip markdown fences with a regex before retrying parse: `json = json.replace(/^```json\n?/, '').replace(/\n?```$/, '')`.
- Validate the parsed object against the expected shape with a lightweight schema check (Zod or manual) before returning it to the client — do not pass raw LLM output downstream.
- Keep the prompt short and the schema simple: a flat array of 10 strings (`string[]`) is more reliable than a nested object with 5 fields per idea.
- Cap scraped content sent to the LLM at ~8,000 tokens (roughly 6,000 words of markdown). Truncate rather than risk output truncation from the model.

**Warning signs:**
- `JSON.parse(): Unexpected token` errors in function logs.
- Frontend receiving `null` or `undefined` where an array is expected — indicates the parsing failed silently.
- LLM responses containing ` ```json ` in the raw Vercel log output.
- Ideas array length varying wildly between requests (sometimes 10, sometimes 2) — indicates schema drift.

**Phase to address:** Phase 2 (LLM integration) — validation layer must exist before connecting to the UI.

---

### Pitfall 8: CORS Misconfiguration on the Astro API Endpoint

**What goes wrong:**
The Astro API endpoint (`src/pages/api/generate.ts`) deployed via the Vercel adapter runs as a serverless function. If the frontend makes `fetch()` requests to `/api/generate` from the same origin (same Vercel deployment), CORS is not an issue. However, during local development with `astro dev`, if a developer tests the API with a different port or an external tool, the default Astro dev server does not set CORS headers. More critically: if a preview deployment URL differs from the production URL and the frontend hardcodes the API URL, cross-origin requests will fail silently.

A secondary gotcha: the Astro Vercel adapter with `output: 'hybrid'` requires `export const prerender = false` on every API endpoint file. If omitted, the endpoint is statically generated at build time (returns empty 200 or 405 on POST), not served as a serverless function. This produces a working local dev experience but broken production behavior — one of the hardest bugs to diagnose.

**Why it happens:**
- `output: 'hybrid'` is the recommended mode for Astro+Vercel (mix static pages + server endpoints). The `prerender = false` requirement is not enforced at build time — it fails silently.
- CORS headers are not set by default in Astro API routes. Most same-origin use cases don't need them, but any external test tooling (Postman, curl from a different port) will fail without them.

**How to avoid:**
- Every API endpoint file must begin with `export const prerender = false;` as the first line — make this a non-negotiable template requirement.
- After every Vercel preview deployment, test the API route directly (not just via the UI) using `curl -X POST https://[preview-url]/api/generate -H "Content-Type: application/json" -d '{"keyword":"test"}'` to confirm it executes as a function and not a static file.
- Add explicit CORS headers in the API handler if any cross-origin use is anticipated:
  ```ts
  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // tighten to specific origin in production
    }
  });
  ```
- Use `output: 'server'` for the entire Astro site if all pages are dynamic — `hybrid` adds correctness overhead for a site with only one server route.

**Warning signs:**
- API endpoint returns 200 with HTML content (the static page fallback) instead of JSON — indicates `prerender = false` is missing.
- `CORS policy` errors in browser console on preview/staging but not local.
- POST request to the API endpoint returns a 405 Method Not Allowed on Vercel but works locally.

**Phase to address:** Phase 1 (scaffold) — set `prerender = false` in the endpoint template; Phase 2 (deployment) — verify with `curl` after first Vercel preview deploy.

---

### Pitfall 9: Firecrawl Free-Tier Credit Burn — JSON Mode and Enhanced Proxy Multipliers

**What goes wrong:**
Firecrawl's free tier includes ~500–1,000 credits/month. What developers miss: enabling **JSON extraction mode** costs **+4 credits per page** (total 5 credits/page), and **enhanced proxy mode** costs **+4 credits per page** (total 5 credits/page, or 9 if both are enabled). A naive implementation that enables both for "better reliability" burns the entire monthly free quota in ~55–110 requests — not 500–1,000.

**Why it happens:**
The credit cost multipliers for JSON mode and enhanced proxy are buried in Firecrawl's pricing documentation and not shown in the API response or dashboard in real-time. Developers enable them for robustness without realizing the multiplicative cost.

**How to avoid:**
- Use plain `/search` or `/scrape` without JSON mode or enhanced proxy by default — use the LLM downstream to extract structure from raw markdown instead of Firecrawl's JSON extraction.
- Never enable enhanced proxy for the free tier unless a specific site blocks standard requests; if you do, cap how many pages use it per request.
- Track Firecrawl credit usage via the dashboard after every test session, not just after production deploys.
- Log the number of Firecrawl API calls per serverless function invocation — a misconfigured crawl (e.g., accidentally passing `limit: 10` instead of `limit: 1`) can burn 10x credits per user request.

**Warning signs:**
- Credits dropping faster than the number of user requests would suggest.
- Firecrawl API returning `402 Payment Required` before the monthly reset.
- Function logs showing `credits_used: 9` per request (indicates both multipliers are active).

**Phase to address:** Phase 2 (Firecrawl integration) — audit credit cost of the planned API call configuration before writing the integration.

---

### Pitfall 10: Cold Start Adds to the Perceived ~20s Pipeline Latency

**What goes wrong:**
Vercel Fluid Compute minimizes cold starts for warm instances, but the **first invocation after a period of inactivity** will cold-start. A cold-started Node.js function on Vercel takes 500ms–2s before any code executes. For a pipeline already targeting 20s, a cold start pushes the first-request experience to 22s+, which feels broken even if subsequent requests are faster.

**Why it happens:**
Free tier does not have reserved/provisioned concurrency. The function scales to zero between requests and must initialize fresh on the next request. With Fluid Compute, warm instances persist for subsequent requests, but a tool with infrequent usage (personal project, side tool) will cold-start on most real-world requests.

**How to avoid:**
- Stream the response using SSE or chunked transfer encoding — the browser shows incremental progress (e.g., "Scraping pages... / Analyzing content... / Generating ideas...") rather than a 20s spinner. Cold start latency becomes invisible when the user sees any activity within 1–2s.
- Use a simple loading state with a step indicator in the UI; this is the single most impactful UX improvement for this latency profile.
- Consider a "keepalive" ping on page load — a lightweight GET to `/api/health` (no external calls) that warms the function instance before the user submits their first keyword.
- Set a realistic user expectation in the UI: "Generating ideas takes 15–30 seconds" copy near the submit button — users who are informed do not perceive a wait as broken.

**Warning signs:**
- First request on a freshly loaded page consistently takes 5–7s longer than subsequent requests.
- No streaming/progress indication in the UI — user sees a frozen button for 20+ seconds.
- Users abandoning the tool mid-generation (high "start but no result" rate in analytics).

**Phase to address:** Phase 3 (UI/UX) — streaming response design must be specified before implementing the frontend; it affects the API response format.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No retry logic on Gemini calls | Simpler code | 5–10% of requests fail silently; user sees errors on busy days | Never — add retries in Phase 2 |
| Hardcoded `maxDuration: 10` in vercel.json from scaffold template | Works for fast endpoints | Pipeline 504s on every real user request | Never — set 60 immediately |
| Using `PUBLIC_FIRECRAWL_KEY` to debug undefined env var | Fixes the error quickly | API key exposed in browser bundle | Never — fix the root cause (server-side only) |
| No input validation on keyword field | Faster to build | Empty/malicious inputs burn Firecrawl + Gemini quota | Never — add min-length check in Phase 1 |
| Enabling Firecrawl JSON mode + enhanced proxy for reliability | Better single-page extraction | 5–9x credit cost multiplier exhausts free tier in days | Never on free tier |
| Skipping `export const prerender = false` on the endpoint | Not visibly broken in dev | API returns static HTML in production instead of JSON | Never — template must include it |
| No error boundary on JSON.parse of LLM output | Less code | Any schema drift crashes the function and returns 500 | Never — wrap in try/catch from day one |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firecrawl `/search` | Passing `https://google.com/search?q=...` as the query URL | Use the `query` parameter for keyword searches; let Firecrawl search its own index |
| Firecrawl credits | Enabling `jsonOptions` extraction on the scrape call | Extract structure via the LLM; use raw markdown from Firecrawl |
| Gemini API | Enabling billing on the AI Studio project to "unlock more quota" | Billing removes the free tier entirely; stay on the keyless free tier |
| Gemini structured output | Using only `responseMimeType: "application/json"` without `responseSchema` | Always pair both; schema-less JSON mode still allows schema drift |
| Astro Vercel adapter | Forgetting `export const prerender = false` on API endpoints | Add to every endpoint file; the build does not error without it |
| Astro env vars | Prefixing server secrets with `PUBLIC_` to debug undefined errors | Access secrets only in server-side endpoint files; never in `.astro` component `<script>` blocks |
| Vercel WAF | Assuming DDoS mitigation protects API endpoints from quota abuse | DDoS mitigation protects infrastructure; quota abuse requires explicit WAF rate-limit rules on the API path |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential Firecrawl + LLM calls with no streaming | 20s+ blank UI, high abandonment | Stream SSE or chunked response with progress steps | From the first user — day 1 |
| Sending full scraped markdown (20,000+ tokens) to Gemini | Slow LLM response, output truncation, schema drift | Cap input at ~8,000 tokens; truncate aggressively | When scraped pages are long-form content |
| No input debounce — user clicks submit repeatedly | Multiplied API calls, quota burn, race conditions | Disable submit button for 10s after first click; show loading state | Any time a user double-clicks |
| Scraping 5+ pages per query on the free Firecrawl tier | Credits exhaust in days | Limit to 1–3 pages per query; use `/search` limit parameter | At >20 users/day |
| Gemini 15 RPM limit hit under concurrent load | 429 errors for all users during burst | Serialize requests with a queue; surface wait time to user | At >3 concurrent users |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `PUBLIC_` prefix on Firecrawl/Gemini API keys | Key visible in browser bundle; anyone can use your quota | Never prefix secrets with `PUBLIC_`; use `astro:env` server-secret type |
| Committing `.env` to git | Permanent key exposure in git history | Add `.env` to `.gitignore` before first `git add .`; use `git-secrets` hook |
| No WAF rate limit on `/api/generate` | Single bot exhausts all free-tier quotas in hours | Add Vercel WAF custom rule limiting requests per IP per minute |
| Accepting arbitrary URLs as Firecrawl scrape targets from user input | SSRF risk — user can probe internal network via Firecrawl | Never pass user-supplied URLs directly to Firecrawl; only pass pre-validated, keyword-derived URLs |
| Returning raw LLM output to client without sanitization | XSS if the LLM generates HTML/script content | Validate and sanitize all LLM text output; treat it as untrusted input |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 20s spinner with no feedback | Users think the app is broken; high abandonment | Streaming progress indicator with step labels ("Searching...", "Reading pages...", "Generating ideas...") |
| Generic 500 error when Gemini returns 429 | User has no idea what happened or what to do | Specific error message: "AI service is busy — please try again in 30 seconds" |
| No indication that free-tier limits exist | Users confused when tool stops working after heavy use | Footer note: "This tool uses free API tiers — it may be temporarily unavailable during high demand" |
| Accepting single-character keyword queries | Triggers Firecrawl + Gemini calls that produce garbage output | Client-side validation: minimum 3–4 characters, no special characters |
| No copy button on generated ideas | Users manually copy-paste each idea; high friction | Add a one-click copy button per idea and a "Copy all" button for the list |

---

## "Looks Done But Isn't" Checklist

- [ ] **API endpoint in production:** Verify with `curl -X POST https://your-domain.com/api/generate` — not just via the browser UI. If it returns HTML, `prerender = false` is missing.
- [ ] **Environment variables on Vercel:** Check Vercel Project Settings > Environment Variables. Variables in `.env` locally do not automatically sync to Vercel — they must be added manually or via the CLI.
- [ ] **Firecrawl credits remaining:** Check the Firecrawl dashboard after integration testing. Each test run burns real credits on the free tier.
- [ ] **Gemini structured output:** Test with a very long input (paste 5,000 words of scraped markdown) to verify the schema holds under context pressure.
- [ ] **Cold start timing:** Test the first request after 10+ minutes of inactivity — this is the realistic user experience, not the warm-instance timing used during development.
- [ ] **WAF rate limit active:** Verify by sending 20 rapid requests to `/api/generate` from the same IP — the 21st should be blocked. If not, the WAF rule is not active.
- [ ] **No secrets in git history:** Run `git log --all --full-history -- .env` and `grep -r "fc-" .git/` to confirm no Firecrawl keys are in git history.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Firecrawl credits exhausted | HIGH (wait up to 30 days) | Switch to SerpApi free tier (100 searches/month) as emergency fallback; display maintenance message; consider self-hosting Firecrawl as a last resort |
| Gemini RPD quota exhausted | MEDIUM (resets at midnight Pacific) | Swap to Groq free tier (Llama 3.3, 14,400 RPD free) as fallback; the endpoint should accept a `provider` parameter to enable swapping |
| Vercel function invocations exhausted | HIGH (wait up to 30 days) | No recovery without upgrading plan; prevention is the only strategy |
| API key committed to git | HIGH | Rotate key immediately in Firecrawl/Google AI Studio dashboard; remove from git history with `git filter-repo`; treat history as permanently compromised |
| Timeout 504 in production | LOW | Set `maxDuration: 60` in `vercel.json`, redeploy — 5-minute fix if caught early |
| `prerender = false` missing from endpoint | LOW | Add the export, redeploy — 5-minute fix |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Vercel timeout misconfiguration | Phase 1: Scaffold & infrastructure | `curl --max-time 65` test against Vercel preview deployment |
| Firecrawl cannot extract PAA/SERP features | Phase 1: Scope definition | Document data source decisions in ADR before writing code |
| Firecrawl blocked on google.com | Phase 1: Architecture | Test Firecrawl `/search` endpoint in isolation before building pipeline |
| API key client-side leak | Phase 1: Scaffold & `.env` setup | `grep -r PUBLIC_ src/` must return no secret key names; build bundle inspection |
| Unguarded public endpoint abuse | Phase 1: API endpoint setup | Load test with 10 rapid requests; verify WAF blocks after threshold |
| Gemini quota exhaustion + silent 429 | Phase 2: LLM integration | Send 20 requests in 60 seconds to verify retry/429 handling works |
| LLM structured output unreliability | Phase 2: LLM integration | Fuzz test with long inputs; verify Zod/manual validation catches schema drift |
| CORS + `prerender = false` missing | Phase 1: Scaffold; Phase 2: Deploy verification | `curl -X POST` to Vercel preview URL after every new deploy |
| Firecrawl credit multipliers | Phase 2: Firecrawl integration | Log `credits_used` from API response; verify it is 1, not 5 or 9 |
| Cold start latency | Phase 3: UI/UX | Test first-request timing after 15-min inactivity; implement streaming before launch |

---

## Sources

- Firecrawl rate limits (official): https://docs.firecrawl.dev/rate-limits
- Firecrawl pricing and credit costs: https://www.firecrawl.dev/pricing
- Firecrawl limitations analysis (2026): https://filipkonecny.com/2026/03/29/firecrawl-limitations/
- Firecrawl vs SerpApi comparison: https://serpapi.com/blog/serpapi-vs-firecrawl/
- Firecrawl Google blocking issues (GitHub): https://github.com/firecrawl/firecrawl/issues/2257
- Vercel Functions Limits (official, updated 2026-06-19): https://vercel.com/docs/functions/limitations
- Vercel Hobby Plan (official, updated 2026-06-16): https://vercel.com/docs/plans/hobby
- Vercel Fluid Compute cold starts: https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts
- Vercel maxDuration configuration: https://vercel.com/docs/functions/configuring-functions/duration
- Gemini free tier limits 2026 (1,500 RPD, 15 RPM, 1M TPM): https://tokenmix.ai/blog/gemini-api-free-tier-limits
- Gemini 429 error guide and December 2025 quota changes: https://www.aifreeapi.com/en/posts/gemini-api-error-429-resource-exhausted-fix
- Gemini structured output (official): https://ai.google.dev/gemini-api/docs/structured-output
- Astro environment variables (official): https://docs.astro.build/en/guides/environment-variables/
- Astro secret leak GitHub issue: https://github.com/withastro/astro/issues/3102
- Astro `astro:env` leak detection discussion: https://github.com/withastro/roadmap/discussions/956
- Google SERP scraping blocking 2026: https://alterlab.io/blog/blog/scrape-google-search-results-without-getting-blocked-2026
- LLM structured output reliability: https://eastondev.com/blog/en/posts/ai/20260506-llm-structured-output/
- Gemini API billing removes free tier: https://usagebox.com/articles/gemini-api-billing-free-tier-confusion

---
*Pitfalls research for: Astro + Vercel serverless + Firecrawl SERP scraping + free LLM YouTube idea generator*
*Researched: 2026-06-30*
