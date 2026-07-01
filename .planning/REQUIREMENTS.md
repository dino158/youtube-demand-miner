# Requirements: YouTube Demand Miner

**Defined:** 2026-06-30
**Core Value:** Turn what people are already searching for on Google into demand-grounded YouTube video ideas — keyword-in → demand-grounded-ideas-out must work.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Input

- [x] **INPUT-01**: User can enter a keyword/niche in a single text field and start generation via a Generate button (and the Enter key)
- [x] **INPUT-02**: User is prevented from submitting an empty or too-short keyword (min ~3 characters), with inline feedback
- [x] **INPUT-03**: The Generate control is disabled while a request is in flight, preventing duplicate submissions and accidental free-tier burn

### Demand Signal

- [x] **DEMAND-01**: On submit, the backend fetches the top-ranking Google organic results for the keyword via Firecrawl (free tier) — capturing result titles and snippets, optionally top-page content
- [x] **DEMAND-02**: The backend parses the Firecrawl response into a compact demand-context payload, capped to stay within the LLM's token budget

### Ideas

- [x] **IDEAS-01**: The backend sends the demand context to an LLM that synthesizes it into 8–12 ranked YouTube video ideas
- [x] **IDEAS-02**: Each idea includes a suggested video title
- [x] **IDEAS-03**: Each idea includes a primary search-intent label (informational / how-to / commercial / comparison)
- [x] **IDEAS-04**: Each idea includes a one-sentence rationale for why it should earn watch time
- [x] **IDEAS-05**: LLM output is schema-enforced and validated before it reaches the UI (8–12 well-formed ideas; malformed responses are handled, not rendered)
- [x] **IDEAS-06**: The LLM provider is swappable via an environment variable, defaulting to a genuinely free tier (Gemini 2.5 Flash); Anthropic Haiku is available as a swap-in

### Results UI

- [x] **UI-01**: Results render as clean cards — one per idea — showing the title, intent label, and rationale
- [x] **UI-02**: While generating, the UI shows a progress/loading state with step labels (not just a spinner), since the pipeline takes ~15–25s
- [x] **UI-03**: On failure, the UI shows a specific error message distinguishing common cases (rate-limit vs. network vs. no results)
- [x] **UI-04**: The layout is mobile-responsive (single-column)

### Export

- [x] **EXPORT-01**: User can copy all ideas as formatted markdown with one button
- [x] **EXPORT-02**: User can export/download all results as JSON
- [x] **EXPORT-03**: User can copy an individual idea to the clipboard

### Deploy & Ops

- [ ] **DEPLOY-01**: The app deploys to Vercel's free hobby tier as a static Astro frontend plus a single serverless function
- [x] **DEPLOY-02**: All API keys are read only from server-side environment variables — none are committed or exposed in the browser bundle
- [ ] **DEPLOY-03**: A README documents setup, required env vars, and deployment using only free tiers
- [ ] **DEPLOY-04**: End-to-end keyword → rendered idea list completes in ~20 seconds under normal conditions

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Demand Signal

- **DEMAND-V2-01**: Add SerpApi free tier (100 searches/mo) to surface real People Also Ask + related searches as structured demand signals, fused with Firecrawl results
- **DEMAND-V2-02**: Per-card demand annotation ("sourced from N organic results")
- **DEMAND-V2-03**: Collapsible source panel showing the top organic results behind the ideas

### Ideas

- **IDEAS-V2-01**: Idea quality badge (High/Medium/Low demand-signal strength)
- **IDEAS-V2-02**: Regenerate/refine ideas with a follow-up instruction
- **IDEAS-V2-03**: Automatic provider fallback (e.g., Groq) when the default provider is rate-limited

### Sharing

- **SHARE-V2-01**: Shareable URL that encodes keyword + results (base64 in the URL hash; no database)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User accounts / auth / login | No v1 value; tool is open-access |
| Direct YouTube Data API (OAuth, quotas) | Demand comes from Google organic results, not YouTube; avoids OAuth and quota management |
| Database / saved history | Results render on screen and export; no persistence needed for v1 |
| Payments / billing | Out of scope by design |
| Rate-limiting infrastructure / WAF guard on the endpoint | User accepts the abuse risk; free-tier ceilings act as a natural cap (informed decision) |
| Exact search-volume numbers | Requires a paid API; breaks the $0 constraint |
| Bulk / batch keyword processing | Requires a job queue or DB; out of scope for a single-page v1 |
| Multi-page app / heavy framework | Single page, kept deliberately small and readable |
| Direct google.com SERP scraping (PAA/related as structured fields) | Google blocks Firecrawl (CAPTCHA); not achievable on free tier — see DEMAND-V2-01 |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INPUT-01 | Phase 3 | Complete |
| INPUT-02 | Phase 3 | Complete |
| INPUT-03 | Phase 3 | Complete |
| DEMAND-01 | Phase 2 | Complete |
| DEMAND-02 | Phase 2 | Complete |
| IDEAS-01 | Phase 2 | Complete |
| IDEAS-02 | Phase 2 | Complete |
| IDEAS-03 | Phase 2 | Complete |
| IDEAS-04 | Phase 2 | Complete |
| IDEAS-05 | Phase 2 | Complete |
| IDEAS-06 | Phase 2 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| EXPORT-01 | Phase 3 | Complete |
| EXPORT-02 | Phase 3 | Complete |
| EXPORT-03 | Phase 3 | Complete |
| DEPLOY-01 | Phase 4 | Pending |
| DEPLOY-02 | Phase 1 | Complete |
| DEPLOY-03 | Phase 4 | Pending |
| DEPLOY-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22 (roadmap complete)
- Unmapped: 0

---
*Requirements defined: 2026-06-30*
*Last updated: 2026-06-30 — traceability populated after roadmap creation*
