# Feature Research

**Domain:** Free single-page keyword-to-YouTube-idea generator (demand-grounded, no auth, no DB)
**Researched:** 2026-06-30
**Confidence:** MEDIUM-HIGH (tool UX inferred from competitor analysis and UX research; no direct user interviews)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Fits $0/No-DB/Serverless? | Notes |
|---------|--------------|------------|--------------------------|-------|
| Keyword / niche text input | Every idea tool starts here | LOW | YES | Single `<input>` or `<textarea>`. Validate non-empty before firing API. |
| 8–12 idea cards, ranked | Users expect a ranked list, not a wall of text. Ranking signals quality ordering. | LOW | YES | Card layout is correct here — all items are the same type, ranking matters, and the number is bounded. Lists outperform cards for uniform-item scanning (NN/G). Cards OK at this small count. |
| Title per idea | Non-negotiable — it IS the idea. A vague description is useless. | LOW | YES | LLM generates this. Should be YouTube-ready (≤ 60 chars, clickable). |
| One-line rationale per idea | Users need to know WHY this idea ranked — without it, the list feels like a random dump. | LOW | YES | 1–2 sentences from LLM. "This surfaces because PAA shows 14 questions about X, signaling unmet demand." |
| Search intent label per idea | Informational / Tutorial / Comparison / Review / Transactional. Tools like SE Ranking show this inline. Users planning YouTube content structure need it. | LOW | YES | LLM classifies. Use YouTube-native labels (not generic SEO labels). See intent taxonomy below. |
| Loading / in-progress state | SERP fetch + LLM synthesis takes 3–8 seconds. A blank page reads as broken. | LOW | YES | Spinner or skeleton cards. Required. |
| Error state with message | Firecrawl rate limit, LLM timeout, empty SERP result. Must show something human-readable. | LOW | YES | Do not swallow errors silently. |
| Copy individual idea to clipboard | Every comparable tool (ryrob, vidIQ, etc.) offers this. Users paste ideas into Notion/Docs. | LOW | YES | `navigator.clipboard.writeText()`. One button per card. |
| Copy-all as Markdown | Power users want all 8–12 ideas in one paste. Markdown is LLM-ready and paste-friendly. | LOW | YES | Format: `## [Title]\n**Intent:** X\n**Rationale:** Y\n` per block. Single button. |
| Export as JSON | Developers and advanced users expect structured output for automation, filtering, or piping into other tools. | LOW | YES | `JSON.stringify(ideas, null, 2)` + `Blob` download. Trivial. |
| Mobile-responsive layout | Users open tools on phones. Non-responsive = unusable on ~50% of devices. | LOW | YES | Single-column card stack on mobile. |
| Demand signal surface (PAA / related searches visible) | Users want proof the ideas are demand-grounded, not AI hallucinations. Showing the raw signals builds trust. | MEDIUM | YES | Surface as collapsible "Sources" or small "Sourced from X PAA questions, Y related searches" badge per card. Does not need to show raw scraped text — just the count or a few labels. |

---

### Differentiators (Competitive Advantage)

Features that set this tool apart. Not expected by default, but meaningfully improve quality or trust.

| Feature | Value Proposition | Complexity | Fits $0/No-DB/Serverless? | Notes |
|---------|-------------------|------------|--------------------------|-------|
| YouTube-native intent taxonomy (not generic SEO) | Most SEO tools use Informational / Navigational / Transactional. YouTube content planning maps better to: Tutorial, How-To, Comparison/Versus, Review/Recommendation, Listicle/Roundup, Deep Dive, Case Study, Reaction/Commentary. This language is what creators actually use. | LOW | YES | Instruct LLM to use YouTube-first labels. No code change — just a better system prompt. |
| Demand signal annotation on each card | Competing tools (vidIQ, ryrob) generate ideas from AI models alone. This tool uses real SERP signals (PAA, related searches) as source material. Making that visible ("3 PAA questions support this", "appears in related searches for X") is a concrete differentiator. | MEDIUM | YES | Requires the LLM to return structured metadata alongside each idea. Needs JSON response schema from LLM. |
| Ranked output (not a flat list) | Tools like the ryrob generator return 10 ideas with no priority signal. Ranking by inferred demand strength (PAA frequency, position in related searches) tells the user where to start. | MEDIUM | YES | LLM ranks based on signal density in scraped SERP data. Explain ranking rationale in card subtitle ("Rank 1: highest PAA frequency"). |
| Shareable URL with encoded state | Users want to share results with a collaborator or return to a previous query. No DB needed — encode query + results in URL hash or `?q=` param (base64 or encodeURIComponent). | MEDIUM | YES | Results are small enough (8–12 ideas × ~200 chars each) to fit in a URL. Enables "share this list" without any backend. |
| Regenerate / refine with follow-up | User types "fitness for beginners" → sees ideas → types "focus on home workouts" → LLM reruns with narrowed context. No history needed — just pass previous results + new input as context. | MEDIUM | YES | Stateless. No session needed. Keep previous ideas in component state. |
| Collapsible SERP source panel | Showing the actual PAA questions and related searches the LLM used builds trust and lets the user evaluate signal quality. Collapsible keeps the UI clean. | MEDIUM | YES | Accordion or "Show sources" toggle per card. Minimal JS. |
| Idea quality badge (High / Medium / Low demand signal) | Derived from how many SERP signals support the idea. "High" = appears in PAA + related searches. "Medium" = one signal type. "Low" = LLM inference only. | MEDIUM | YES | Requires the LLM to return a confidence field per idea in its JSON response. |

---

### Anti-Features (Deliberately NOT Building)

Features that seem valuable but violate scope or create disproportionate complexity.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts / saved history | Users want to return to past results | Requires auth, DB, session management — blows up the entire "no accounts, no database" constraint. Maintenance burden is permanent. | Shareable URL encoding solves 80% of this need without a database. |
| YouTube Data API integration (real search volume, channel analytics) | Users want "real" volume numbers | YouTube API has OAuth requirements, daily quota limits (10,000 units/day free), and returns data at keyword granularity that requires mapping — not a single-page problem. Scope defined as "no YouTube API." | Use PAA + related searches as demand proxies. They correlate with search intent without requiring API keys. |
| Payments / premium tier | Monetization | Adds Stripe, webhook handling, plan gating logic, and user state. Out of scope. | Keep it $0. If demand justifies monetization, that's a v2 decision. |
| Chrome extension | Users want in-browser convenience | Completely different distribution channel (Chrome Web Store approval, manifest V3, etc). Single-page web tool is the defined form factor. | Shareable URL satisfies the portability need. |
| Bulk / batch keyword processing | Power users want to run 50 keywords at once | Requires job queue, async processing, or polling — impossible to do gracefully without a DB or server state. Also multiplies Firecrawl cost per run. | Run one query, copy results, run again. The tool is ideation, not bulk data export. |
| Search volume numbers (exact) | Users trust numbers | Accurate search volume requires Google Keyword Planner API (requires Google Ads account), Ahrefs/SEMrush API (paid), or DataForSEO. All cost money and add paid dependencies. Showing fake or inaccurate numbers is worse than not showing them. | Show demand signals (PAA count, presence in related searches) as qualitative proxies. Frame as "relative demand" not "exact volume." |
| Real-time trending topics feed | Keeps tool feeling fresh | Requires polling an external service continuously (Google Trends API, YouTube Trending endpoint) — either needs a server or leaks API keys. | User enters the keyword — pull demand signals at query time from SERP. |
| AI-generated thumbnails | Full content production pipeline | Image generation API cost, latency, and storage — multiplies scope. This tool is idea generation, not content production. | Scope ends at the idea + title + rationale. |
| Comment / annotation on ideas | Collaboration | Requires persistence (DB). Violates constraint. | User copies ideas to their own tool (Notion, Docs) for annotation. |
| Keyword difficulty / competition score | Competitive analysis | Requires scraping YouTube SERP or querying paid APIs. Out of scope for a SERP-grounded idea generator. | Demand signal badges (High/Medium/Low) based on PAA + related search presence serve the same directional purpose. |

---

## Feature Dependencies

```
[Keyword Input]
    └──triggers──> [SERP Fetch via Firecrawl]
                       └──feeds──> [LLM Synthesis]
                                       └──renders──> [Idea Cards]
                                                         ├──enables──> [Copy Individual Idea]
                                                         ├──enables──> [Copy-All as Markdown]
                                                         ├──enables──> [Export as JSON]
                                                         └──enables──> [Shareable URL]

[LLM JSON Response Schema]
    └──required-by──> [Search Intent Label per Card]
    └──required-by──> [Demand Signal Annotation per Card]
    └──required-by──> [Idea Quality Badge]
    └──required-by──> [Ranked Output]

[Demand Signal Annotation]
    └──enhances──> [Collapsible SERP Source Panel]

[Shareable URL]
    └──conflicts-with──> [User Accounts] (URL encoding makes accounts redundant for basic sharing)

[Bulk Processing]
    └──conflicts-with──> [No-DB Constraint] (requires async job state)

[Exact Search Volume]
    └──conflicts-with──> [$0 Cost Constraint] (requires paid API)
```

### Dependency Notes

- **Idea Cards require LLM JSON Response Schema:** The LLM must return a structured array (not prose) for the UI to render individual card fields. This is the most critical technical contract to define early.
- **All export features require Idea Cards:** Copy, Markdown, and JSON export are only possible once the card data is in component state. They're trivial to add after cards render.
- **Demand Signal Annotation requires Firecrawl to return PAA + related searches:** The scrape must be structured enough to extract these SERP feature types. Firecrawl's `/search` or `/scrape` with JSON extraction schema is the right pattern.
- **Shareable URL conflicts with User Accounts:** Once URL encoding is implemented, accounts add zero value for the core sharing use case. Do not build both.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — sufficient to validate whether demand-grounded idea generation is useful.

- [ ] Keyword input + submit — the entry point for everything
- [ ] Firecrawl SERP fetch (PAA + related searches) — the demand signal foundation
- [ ] LLM synthesis into 8–12 ranked ideas — the core value
- [ ] Idea cards with: title + intent label + one-line rationale — the output
- [ ] Loading state and error state — table stakes for usability
- [ ] Copy individual idea to clipboard — minimum useful action on output
- [ ] Copy-all as Markdown — the second-most-requested output action (based on tool comparisons)
- [ ] Export as JSON — low effort, high utility for technical users
- [ ] Mobile-responsive layout — not optional at any launch

### Add After Validation (v1.x)

Features to add once core concept is confirmed working and useful.

- [ ] Demand signal annotation per card ("Sourced from 5 PAA questions") — add when users ask "why this idea?"
- [ ] Shareable URL encoding — add when users ask "how do I share this?"
- [ ] Collapsible SERP source panel — add when trust / transparency is the top feedback theme
- [ ] Idea quality badge (High/Medium/Low) — add alongside demand signal annotation

### Future Consideration (v2+)

Features to defer until the tool has demonstrated real usage.

- [ ] Regenerate / refine with follow-up input — adds stateful UX complexity
- [ ] YouTube-native intent taxonomy refinement — iterate based on what labels creators find useful
- [ ] Any export format beyond Markdown and JSON (CSV, PDF, etc.) — add only on request

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Keyword input + SERP fetch | HIGH | LOW | P1 |
| LLM synthesis → ranked idea list | HIGH | MEDIUM | P1 |
| Idea cards (title + intent + rationale) | HIGH | LOW | P1 |
| Loading + error states | HIGH | LOW | P1 |
| Copy individual idea | HIGH | LOW | P1 |
| Copy-all as Markdown | HIGH | LOW | P1 |
| Export as JSON | MEDIUM | LOW | P1 |
| Mobile-responsive layout | HIGH | LOW | P1 |
| Demand signal annotation per card | HIGH | MEDIUM | P2 |
| Shareable URL encoding | MEDIUM | MEDIUM | P2 |
| Collapsible SERP source panel | MEDIUM | MEDIUM | P2 |
| Idea quality badge | MEDIUM | LOW | P2 |
| Regenerate / refine follow-up | MEDIUM | MEDIUM | P3 |
| Bulk processing | LOW | HIGH | ANTI |
| User accounts | LOW | HIGH | ANTI |
| Exact search volume | LOW | HIGH | ANTI |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration
- ANTI: Explicitly out of scope

---

## Competitor Feature Analysis

| Feature | vidIQ AI Ideas | ryrob Generator | AnswerThePublic | AlsoAsked | Our Approach |
|---------|---------------|-----------------|-----------------|-----------|--------------|
| Input type | Channel description + niche | Topic/keyword | Keyword | Keyword | Keyword / niche (single input) |
| # ideas generated | Unspecified | 10 | Hundreds (questions) | PAA tree | 8–12 (bounded, curated) |
| Demand grounding | Trend data (opaque) | None stated | Autocomplete data | PAA from Google | SERP PAA + related searches (explicit) |
| Intent label | None | None | Question category (who/what/how) | None | YouTube-native intent type per idea |
| Per-idea rationale | None | None | None | None | One-line rationale per idea |
| Ranking | None | None | Radial (visual weight) | Hierarchical tree | Explicit rank 1–12 by demand signal strength |
| Copy individual | Yes | Yes | Yes | Yes | Yes |
| Copy-all as Markdown | No | No | No | No | Yes (differentiator) |
| Export as JSON | No (CSV/bulk) | CSV | CSV | None | Yes (differentiator) |
| No login required | No (requires account) | Yes (free tier) | Limited (3/day free) | No | Yes |
| Shareable URL | No | Partial | No | No | v1.x |
| Source transparency | No | No | No | PAA hierarchy | Demand signal annotation per card |

---

## Intent Taxonomy for This Tool

Recommended YouTube-native labels (not generic SEO categories). These map to how creators plan content, not how SEO tools categorize queries.

| Intent Label | When to Use | Example Title Pattern |
|-------------|-------------|----------------------|
| Tutorial / How-To | Step-by-step instruction is the dominant search goal | "How to X in 10 Minutes" |
| Comparison / Versus | User is choosing between options | "X vs Y: Which One Should You Get?" |
| Review / Recommendation | User wants an expert verdict before acting | "Is X Worth It? Honest Review After 6 Months" |
| Listicle / Roundup | User wants curated options, not a single answer | "7 Best X for [Audience]" |
| Deep Dive / Explainer | User wants conceptual understanding, not steps | "Why X Happens (And What It Means for Y)" |
| Beginner Guide | User is new to a topic and needs orientation | "X for Beginners: Everything You Need to Know" |
| Case Study / Story | User wants real-world example or proof | "How I Used X to Achieve Y (Real Numbers)" |
| Mistake / Warning | User wants to avoid failure | "X Mistakes Beginners Make with Y" |

This taxonomy is LLM-instructable — the system prompt tells the model to classify each idea using exactly these labels. No additional code required.

---

## Sources

- [vidIQ AI Video Ideas Generator](https://vidiq.com/ai-video-ideas-generator/) — competitor feature audit
- [ryrob YouTube Video Idea Generator](https://www.ryrob.com/youtube-video-idea-generator/) — competitor feature audit (CSV export, copy-per-idea)
- [AnswerThePublic](https://answerthepublic.com/en) — demand signal presentation, radial UX, question categorization
- [AlsoAsked](https://etasolution.in/alsoasked-answerthepublic-tools-for-digital-marketers/) — PAA hierarchy presentation, no volume data
- [OutlierKit Best YouTube Keyword Research Tools](https://outlierkit.com/blog/best-youtube-keyword-research-tools) — demand signal and export feature comparison
- [SE Ranking: Search Intent Types](https://seranking.com/blog/search-intent/) — intent classification taxonomy (six types including Generative AI intent)
- [YouTube Search Intent Analysis Guide](https://instantviews.net/search-intent-analysis-guide) — YouTube-native intent mapping (Informational, Navigational, Transactional, Commercial Investigation)
- [TubeBuddy Advanced Keyword Research 2026](https://www.tubebuddy.com/blog/advanced-keyword-research-techniques-for-youtube-in-2026/) — keyword research feature baseline
- [NN/G Cards UI Component](https://www.nngroup.com/articles/cards-component/) — when cards vs lists; cards inappropriate for ranked search results at scale but acceptable for bounded idea sets
- [Firecrawl: Mastering the Search Endpoint](https://www.firecrawl.dev/blog/mastering-firecrawl-search-endpoint) — single-endpoint SERP fetch returning LLM-ready markdown
- [Keyword.com Export Features](https://support.keyword.com/en/articles/13714129-exporting-ranking-data-pdf-csv-text) — CSV/export user expectations baseline
- [Copy as Markdown Chrome Extension patterns](https://dev.to/learncomputer/transform-your-copy-paste-workflow-clipboard-to-markdown-converter-4ad) — copy-as-markdown workflow demand signal

---

*Feature research for: free single-page keyword-to-YouTube-idea generator*
*Researched: 2026-06-30*
