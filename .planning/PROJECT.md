# YouTube Demand Miner

## What This Is

A single-page web app where you enter a keyword or niche and get back a ranked list of YouTube video ideas grounded in real Google search demand. A serverless function uses Firecrawl to fetch the top-ranking Google results for the keyword (organic result titles, snippets, and optionally top-page content), then an LLM synthesizes that demand signal into 8–12 concrete video concepts — each with a suggested title, the search intent behind it, and a one-line rationale for why it should earn watch time. It's a content-ideation tool for a channel that needs topics with proven demand, not guesses.

## Core Value

Turn what people are already searching for on Google into demand-grounded YouTube video ideas — bridging SEO keyword research and YouTube content planning, which are normally disconnected. If everything else fails, the keyword-in → demand-grounded-ideas-out flow must work.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

- [ ] User enters a keyword/niche and clicks Generate
- [ ] Backend fetches the top-ranking Google results for that keyword via Firecrawl (free tier) — capturing organic result titles, snippets, and optionally top-page content as the demand signal
- [ ] Backend passes the scraped demand signal to an LLM that synthesizes it and produces 8–12 YouTube video ideas
- [ ] Each idea returns: video title, primary search intent (informational / how-to / commercial / comparison), and a one-sentence rationale
- [ ] Frontend displays ideas as clean cards
- [ ] User can copy all ideas as markdown
- [ ] User can export results as JSON
- [ ] LLM provider is swappable via configuration, defaulting to a genuinely free tier (zero spend)
- [ ] Deploys free to Vercel as a static Astro frontend + a single serverless function
- [ ] README documents setup, required env vars, and deployment — all on free tiers only
- [ ] End-to-end keyword → usable idea list returns in ~20 seconds

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- User accounts / auth / login — adds complexity with no v1 value; tool is open-access
- Direct YouTube API connection (OAuth, quotas) — demand comes from Google SERP, not YouTube; avoids OAuth and quota management
- Saved history / database — results render on screen and export; no persistence needed for v1
- Payments / billing — out of scope by design
- Rate-limiting infrastructure beyond free-tier ceilings — user accepts abuse risk; free-tier limits act as a natural cap (see Key Decisions)
- Multi-page app / heavy framework — single page, kept deliberately small and readable

## Context

- **Purpose & audience:** Built for a content creator who needs YouTube topics with proven search demand. Doubles as a portfolio/interview piece — the code must be simple enough to walk through and explain in an interview.
- **Existing assets:** User has a Firecrawl API key (free tier) and an Anthropic API key. Research confirmed the $0 default provider as **Google Gemini 2.5 Flash** (1,500 req/day free, no card, no expiry), accessed via the Vercel AI SDK so swapping to Anthropic Haiku (or Groq as a fallback) is a one-env-var change. A free Google AI Studio key needs to be obtained for the default provider; never enable billing on that Google project (it removes the free tier).
- **Security model:** The only sensitive assets are the API keys. They live exclusively as serverless-function environment variables on Vercel — never in the frontend bundle, never committed (`.gitignore` excludes `.env`; repo ships `.env.example` with placeholders; keys are never `PUBLIC_`-prefixed). The browser calls the function; the function calls Firecrawl/LLM. The browser never receives a key.
- **Demand signal (scope-corrected after research):** Firecrawl cannot scrape google.com directly (CAPTCHA) and cannot return People Also Ask or related searches as structured SERP fields. v1 therefore grounds demand on Firecrawl's `/search` organic results (titles + snippets, optionally top-page content). Structured PAA/related-searches via SerpApi's free tier (100 searches/mo) is a documented v2 upgrade path, not v1.
- **Known tension:** "Everything free" vs. the Anthropic API billing per token — resolved by defaulting to a free LLM tier and keeping the provider swappable.

## Constraints

- **Budget**: Zero paid services — no paid hosting, databases, or APIs beyond free tiers — because the project must run at $0.
- **Tech stack**: Astro static frontend + Tailwind; one serverless function (single endpoint) orchestrating scrape → LLM — keep it small, readable, no over-engineering.
- **Scraping**: Firecrawl free tier (user has a key); free fallback if too limited.
- **LLM**: Swappable provider behind a thin interface; default to a genuinely free tier; Anthropic Haiku available as optional swap-in.
- **Hosting**: Deployable free to Vercel hobby tier (preferred) or Railway free tier — must fit static frontend + lightweight serverless function.
- **Persistence**: No database for v1; only free-tier storage if ever needed.
- **Security**: API keys only as environment variables, never committed.
- **Performance**: Keyword → idea list in ~20 seconds end-to-end.
- **Maintainability**: Code simple enough to understand fully and explain in an interview.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Astro 5 for the frontend (over React) | Ships near-zero JS; cleanest fit for a tiny static page + one serverless function; matches "small and readable" goal. Astro 6 avoided due to known `@astrojs/vercel` SSR bugs | ✓ Done (Phase 1) — `output: 'hybrid'` was removed in Astro 5; implemented as `output: 'static'` + per-route `prerender = false`. Adapter pinned to `@astrojs/vercel@9.0.5` (v11 requires Astro 7) |
| Swappable LLM via Vercel AI SDK, default Gemini 2.5 Flash (truly $0) | Honors "everything free" — Gemini free tier has no per-token billing; AI SDK makes Haiku/Groq a one-env-var swap; Anthropic Haiku stays an optional swap-in | — Pending |
| Demand signal = Firecrawl organic results (not PAA/related searches) | Firecrawl/Google block direct SERP-feature scraping; organic titles+snippets+content is the $0 path and keeps it simple; SerpApi PAA deferred to v2 | — Pending |
| No endpoint guard (no auth, no rate-limiting infra) | Key secrecy is handled by architecture regardless; user accepts abuse risk; free-tier ceilings cap damage; keeps URL openly demoable | — Pending |
| Single serverless function, single endpoint | Keeps the system minimal and fits Vercel free tier | — Pending |
| No database for v1 | Results render on screen and export as markdown/JSON; no persistence need | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-30 — Phase 1 (Scaffold & Security) complete: Astro 5 + Vercel scaffold, server-only env security, gitleaks hook (DEPLOY-02 verified)*
