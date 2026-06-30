# YouTube Demand Miner

## What This Is

A single-page web app where you enter a keyword or niche and get back a ranked list of YouTube video ideas grounded in real Google search demand. A serverless function scrapes Google's search results, People Also Ask, and related searches for the keyword, then an LLM synthesizes that demand into 8–12 concrete video concepts — each with a suggested title, the search intent behind it, and a one-line rationale for why it should earn watch time. It's a content-ideation tool for a channel that needs topics with proven demand, not guesses.

## Core Value

Turn what people are already searching for on Google into demand-grounded YouTube video ideas — bridging SEO keyword research and YouTube content planning, which are normally disconnected. If everything else fails, the keyword-in → demand-grounded-ideas-out flow must work.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Hypotheses until shipped. -->

- [ ] User enters a keyword/niche and clicks Generate
- [ ] Backend scrapes the Google SERP for that keyword via Firecrawl (free tier), capturing top result titles, People Also Ask questions, and related searches
- [ ] Backend passes scraped demand data to an LLM that clusters it and produces 8–12 YouTube video ideas
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
- **Existing assets:** User has a Firecrawl API key (free tier) and an Anthropic API key. Anthropic stays available as an optional swap-in LLM provider, but the default must be a $0 provider (Google Gemini free tier is the leading candidate — to be confirmed in research). A free Google AI Studio key may need to be obtained for the default provider.
- **Security model:** The only sensitive assets are the API keys. They live exclusively as serverless-function environment variables on Vercel — never in the frontend bundle, never committed (`.gitignore` excludes `.env`; repo ships `.env.example` with placeholders). The browser calls the function; the function calls Firecrawl/LLM. The browser never receives a key.
- **Firecrawl fallback:** If Firecrawl's free tier proves too limited for SERP scraping, fall back to a free scraping approach.
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
| Astro for the frontend (over React) | Ships near-zero JS; cleanest fit for a tiny static page + serverless function; matches "small and readable" goal | — Pending |
| Swappable LLM provider, default to a free tier (truly $0) | Honors the "everything free" constraint; Anthropic bills per token; abstraction keeps Anthropic available as optional swap-in | — Pending |
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
*Last updated: 2026-06-30 after initialization*
