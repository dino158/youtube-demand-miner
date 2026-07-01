# Roadmap: YouTube Demand Miner

## Overview

Four phases that follow the natural dependency chain of a single-page tool with one serverless function: stand up the scaffold with secure env var handling first, build and verify the backend pipeline against the confirmed API contract, wire the frontend and all UX/export behaviours once the contract is stable, then deploy to Vercel and confirm real-world performance. Every v1 requirement maps to exactly one phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Scaffold & Security** - Astro 5 + Vercel hybrid setup, env var security enforced, timeout configured
- [ ] **Phase 2: Backend Pipeline** - Firecrawl fetch → demand parser → LLM provider strategy → POST /api/generate endpoint
- [ ] **Phase 3: Frontend, UX & Export** - Input form, idea cards, loading/error states, mobile layout, copy/export actions
- [ ] **Phase 4: Deploy & Ops** - Vercel deployment verified, README complete, end-to-end performance confirmed

## Phase Details

### Phase 1: Scaffold & Security
**Goal**: A working Astro 5 + Vercel hybrid project exists with correct timeout config, enforced server-side env var security, and no accidental key exposure possible
**Depends on**: Nothing (first phase)
**Requirements**: DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. `astro dev` starts without errors and serves a placeholder page at localhost
  2. `vercel build` succeeds and produces a static frontend plus one serverless function at `/api/generate`
  3. No API key can appear in the browser bundle — `PUBLIC_`-prefixed env vars are blocked at the type level (`astro:env` schema, `context: "server"`)
  4. `.env` is gitignored; `.env.example` ships with placeholder values; a real key committed by mistake is caught before push
  5. `vercel.json` sets `maxDuration: 60` on the API function so a 20-second pipeline cannot 504
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — Scaffold Astro 5 in repo root (Vercel v11 adapter, Tailwind v4 Vite plugin, output:'static' + prerender=false), maxDuration:60 in adapter + vercel.json, env security (astro:env server schema, .gitignore, .env.example, gitleaks pre-commit hook)

### Phase 2: Backend Pipeline
**Goal**: `POST /api/generate` accepts `{ keyword }` and returns `{ ideas: VideoIdea[] }` — verified with curl against a Vercel preview deployment
**Depends on**: Phase 1
**Requirements**: DEMAND-01, DEMAND-02, IDEAS-01, IDEAS-02, IDEAS-03, IDEAS-04, IDEAS-05, IDEAS-06
**Success Criteria** (what must be TRUE):
  1. A `curl -X POST /api/generate -d '{"keyword":"drone photography"}'` call returns a valid JSON array of 8–12 `VideoIdea` objects, each with `title`, `intent`, and `rationale` fields
  2. The LLM provider switches from Gemini to Haiku by changing the `LLM_PROVIDER` env var — no code change required
  3. Malformed or schema-invalid LLM responses are caught by Zod validation and return a structured error — they never reach the client as broken data
  4. Firecrawl is called with no JSON extraction mode and no enhanced proxy mode (credit budget preserved); the parser caps output to ~8,000 tokens before sending to the LLM
  5. An empty or missing keyword returns a 400 with a clear error message before any external API call is made
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Foundation: install AI SDK (ai + @ai-sdk/google + @ai-sdk/anthropic + zod), VideoIdea + error-code types, AppError envelope, Firecrawl /v2/search fetcher, token-capped demand parser, env-keyed provider factory (createGoogleGenerativeAI/createAnthropic), generateObject idea generator with 8-12 count enforcement [Wave 1]
- [x] 02-02-PLAN.md — Orchestrator: wire api/generate.ts (Zod request validation -> Firecrawl+retry -> NO_RESULTS guard -> parser -> generateIdeas -> { ideas } / { error: { code, message } }), curl-verify the contract [Wave 2, depends on 02-01, has human-verify checkpoint]

### Phase 3: Frontend, UX & Export
**Goal**: A user can type a keyword, click Generate, watch labeled progress steps, read 8–12 idea cards, and copy or export the results — all from a mobile-responsive page
**Depends on**: Phase 2
**Requirements**: INPUT-01, INPUT-02, INPUT-03, UI-01, UI-02, UI-03, UI-04, EXPORT-01, EXPORT-02, EXPORT-03
**Success Criteria** (what must be TRUE):
  1. Submitting a keyword under 3 characters shows an inline validation error and makes no network request; the Generate button is disabled while a request is in flight
  2. During generation, the UI shows step-labeled progress (e.g., "Searching pages...", "Analyzing content...", "Generating ideas...") — not a bare spinner
  3. Each idea renders as a card showing the video title, intent label, and one-sentence rationale; cards are readable on a 375px-wide mobile screen in a single column
  4. On failure, the UI displays a specific message distinguishing rate-limit, network, and no-results cases — it does not show a raw error object or go blank
  5. User can copy a single idea card to the clipboard, copy all ideas as formatted markdown, and download all results as a JSON file — each with one button click
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Static Astro shell: rewrite index.astro with the keyword form (minlength 3, required), four hidden state regions (input-error, progress+label, error, results), mobile-first single-column Tailwind layout, and the app.ts module script include [Wave 1]
- [ ] 03-02-PLAN.md — Client island app.ts wired to /api/generate: min-3 client validation, in-flight button disable, simulated timed progress labels, 5-code error taxonomy + network-failure map, XSS-safe idea cards with intent badges, and copy-one/copy-all-markdown/download-JSON export actions [Wave 2, depends on 03-01, has human-verify checkpoint]
**UI hint**: yes

### Phase 4: Deploy & Ops
**Goal**: The app is live on Vercel's free hobby tier, API keys are confirmed never committed, the README enables a fresh setup from zero, and a real keyword completes in ~20 seconds
**Depends on**: Phase 3
**Requirements**: DEPLOY-01, DEPLOY-03, DEPLOY-04
**Success Criteria** (what must be TRUE):
  1. The app is accessible at a public Vercel URL and the full keyword → idea list flow works in a real browser (not just localhost)
  2. A fresh clone of the repo, following only the README, produces a working local dev environment with no undocumented steps
  3. End-to-end keyword → rendered idea list completes in under 25 seconds on a warm Vercel function invocation
  4. A git log and repo file listing confirm no `.env` file or real API key value appears in any commit
**Plans**: TBD

Plans:
- [ ] 04-01: Vercel project creation, env var configuration, production deploy, README (setup, env vars, free-tier-only deployment guide), performance verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold & Security | 0/1 | Not started | - |
| 2. Backend Pipeline | 0/2 | Not started | - |
| 3. Frontend, UX & Export | 0/2 | In progress | - |
| 4. Deploy & Ops | 0/1 | Not started | - |
