# Phase 4: Deploy & Ops - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Take the finished app live and prove it works in the real world:
1. **Deploy** the static Astro frontend + single serverless function (`_render.func`) to Vercel's free hobby tier (DEPLOY-01).
2. **README** that lets a fresh clone reach a working local dev environment and a deploy with no undocumented steps, on free tiers only (DEPLOY-03).
3. **Performance verification** — a real keyword → rendered idea list on the live URL, warm, under 25s (DEPLOY-04).
4. **Key-safety confirmation** — git history + repo listing show no `.env` / real key ever committed (DEPLOY-02 was implemented in Phase 1; this phase re-confirms it against the deployed state).

**Out of scope for this phase (locked at project level):** no auth, no rate-limiting/WAF guard, no database, no custom domain requirement, no paid services. New product capabilities belong in other phases / v2.

</domain>

<decisions>
## Implementation Decisions

### Performance vs. free-tier timeout (the phase's central risk)
- **D-01:** **Accept & document** the Gemini free-tier latency variance rather than engineer around it. Typical warm runs are ~13s (Phase 2 live: 200 + 9 ideas in 13.0s), comfortably under the <25s target. The observed ~69.4s tail spikes are treated as a **known free-tier limitation**, not a defect. Keep `maxDuration: 60` as the ceiling (already set via the adapter — confirmed in build output). **No backend speed-tuning** (do not reduce Firecrawl results, tighten the token cap, or drop the retry) — the $0 principle and demand-signal richness win over shaving the rare tail.
- **D-02:** **Document the latency tradeoff in the README** — an explicit "expected performance" note: typical ~15–20s, occasional free-tier spikes, and that Haiku (`LLM_PROVIDER=haiku`) is the swap for anyone wanting consistent low latency at cost.

### DEPLOY-04 verification method
- **D-03:** Verify against **typical performance, not the tail.** Run the **same keyword 3–5 times warm** on the live Vercel URL, report **median + range**. **Median under 25s = PASS.** This is honest about variance and produces good portfolio evidence. (Cold-start / first-invocation runs are excluded from the median — the criterion is explicitly "warm invocation.")

### Timeout / 504 UX (the one currently-unhandled failure mode)
- **D-04:** **Extend Phase 3's client error taxonomy to handle the Vercel 504 / gateway timeout** (function killed at `maxDuration`). Map it to a clear, friendly message along the lines of "the free tier is busy — try again in a moment" instead of a raw error object, blank screen, or unparsed HTML response. This is a **small frontend touch-up** to `src/scripts/app.ts` — the app currently maps a JSON error envelope + generic network failures, but a 504 returns non-JSON and would otherwise fall through. Note: the function cannot catch its own `maxDuration` kill, so this is handled purely client-side on the fetch response.

### Deploy method (defaulted — user opted not to deep-dive; CONFIRM before executing)
- **D-05:** **Default: push to GitHub → import the repo into Vercel (Git-connected, auto-deploy on push).** Rationale: this is a portfolio/interview piece, so a public repo + visible CI/CD deploy is the natural fit; the repo is currently **local-only (no git remote)**. **This creates a public GitHub repository — an outward-facing action — so the executor MUST confirm with the user before creating the remote/pushing.** If the user declines GitHub, the fallback is **Vercel CLI** (`npx vercel --prod`, CLI not currently installed) — no GitHub required.

### Live provider & Vercel env config (defaulted)
- **D-06:** Deploy the public URL on **Gemini ($0 default).** Set on the Vercel project: `FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, and `LLM_PROVIDER=gemini`. Leave `ANTHROPIC_API_KEY` **unset/optional** (the `astro:env` schema already marks all keys `optional: true`; the orchestrator guards missing keys). Haiku remains a documented one-env-var swap, not wired for the live demo.

### README scope (defaulted)
- **D-07:** **Portfolio-grade README** (it doubles as an interview artifact), covering: project overview + core value, quickstart (clone → `npm install` → `.env` from `.env.example` → `astro dev`), a **free-API-key walkthrough** (Firecrawl free tier; Google AI Studio key — with the "never enable billing on that Google project" warning), the required env vars, the **free-tier-only Vercel deployment guide**, an architecture / how-it-works section (scrape → parse → LLM → cards; the swappable-provider design), and the **$0 + expected-performance/latency notes** from D-02.

### Claude's Discretion
- Exact README section ordering, prose, and whether to include screenshots/GIFs.
- Exact wording of the 504 friendly-error message and how it slots into the existing taxonomy.
- The specific keyword used for the DEPLOY-04 median measurement and how the evidence is recorded (e.g., in a verification note).
- Whether to leave the (now-confirmed-moot) `vercel.json` per-route `maxDuration` key in place or remove it — the adapter config is authoritative either way.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

This project has **no external specs or ADRs** (no `docs/` folder). The authoritative references are the planning documents and the existing scaffold/build state below.

### Phase requirements & success criteria
- `.planning/ROADMAP.md` § "Phase 4: Deploy & Ops" — goal + the 4 success criteria (public URL works end-to-end; fresh clone works from README alone; warm run < 25s; no key ever committed).
- `.planning/REQUIREMENTS.md` § "Deploy & Ops" — DEPLOY-01 (Vercel free deploy), DEPLOY-03 (README), DEPLOY-04 (~20s perf); DEPLOY-02 (keys server-only) already Complete in Phase 1.

### Locked project-level decisions & constraints
- `.planning/PROJECT.md` § "Constraints" — $0 budget (free tiers only), Vercel hobby hosting, ~20s perf target, interview-explainable simplicity.
- `.planning/PROJECT.md` § "Context" — security model (keys are server-only env vars, never committed, never `PUBLIC_`-prefixed); free-tier provider details (Gemini 2.5 Flash 1,500 req/day; **never enable billing on the Google AI project — it removes the free tier**); the Anthropic-billing tension resolved via free default.
- `.planning/PROJECT.md` § "Key Decisions" — single serverless function; no endpoint guard; no DB; swappable LLM (Gemini default, Haiku swap).

### Existing scaffold & build state (the deploy integration surface)
- `astro.config.mjs` — Vercel adapter with `maxDuration: 60`; `astro:env` server schema declaring the four env vars (all `optional: true`); `output: 'static'`.
- `vercel.json` — `maxDuration: 60` keyed on `src/pages/api/generate.ts`. **Note: the adapter emits a single consolidated `_render.func`, not a per-route `api/generate` function, so this key does not match; the adapter's `maxDuration: 60` is the authoritative source** — confirmed in `.vercel/output/functions/_render.func/.vc-config.json` (`"maxDuration": 60`, `runtime: nodejs24.x`, streaming enabled).
- `.env.example` — canonical list of required env vars to mirror into the Vercel project.
- `.gitignore` — already excludes `.env`, `.env.*.local`, `.vercel/`; a gitleaks `pre-commit` hook exists (`.git/hooks/pre-commit`) from Phase 1.
- `src/scripts/app.ts` — Phase 3 client island holding the current error taxonomy (5 codes + network-failure map) that D-04 extends for the 504 case; also holds the progress schedule that already tolerates long waits.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Adapter `maxDuration: 60`** (`astro.config.mjs`) — already correctly applied to `_render.func` (verified in build output). No timeout change needed; keep as the ceiling per D-01.
- **`astro:env` server schema** — all four env vars declared `optional: true`; the Vercel env config (D-06) just needs to supply the two live keys + `LLM_PROVIDER`.
- **gitleaks `pre-commit` hook** (`.git/hooks/pre-commit`) — the existing guard backing the DEPLOY-02 re-confirmation. `git ls-files` currently shows only `.env.example` tracked (no real `.env`).
- **Phase 3 client error taxonomy** (`src/scripts/app.ts`) — the extension point for the 504 friendly-error handling (D-04).
- **`.env.example`** — the source of truth for what the README env-var section and the Vercel project env must document/set.

### Established Patterns
- **Single consolidated `_render.func`** (nodejs24.x, response streaming on) — not per-route functions. Any function-level config must target this reality, not `api/generate`.
- **`output: 'static'` + `prerender = false`** on the API route — the correct Astro 5 pattern (Phase 1 decision); the deploy must not reintroduce a `hybrid` assumption.
- **Client-side error handling** switches on a structured `{ error: { code, message } }` envelope; a raw 504 is non-JSON and needs its own branch (D-04).

### Integration Points
- **Vercel project env vars** — where the keys defined in Phase 2 get configured for real (D-06). This is the primary new "integration" of the phase.
- **New file: `README.md` at repo root** — does not exist yet; the DEPLOY-03 deliverable.
- **GitHub remote** — does not exist yet (repo is local-only); D-05's default deploy path creates it (confirm-before-push).
- **`src/scripts/app.ts`** — the single frontend file touched this phase (504 handling, D-04); no backend files change under D-01.

</code_context>

<specifics>
## Specific Ideas

- The public URL must run the **full keyword → idea-list flow in a real browser** (not just localhost) — success criterion #1.
- A **fresh clone following only the README** must reach a working dev env with **no undocumented steps** — success criterion #2. Treat the README as testable: someone with zero context should get there.
- Verification evidence for perf should be **honest about free-tier variance** (median + range), not a cherry-picked best run.
- Keep everything **$0 and interview-explainable** — the README's architecture section should read like a walkthrough one could give in an interview.

</specifics>

<deferred>
## Deferred Ideas

- **Automatic provider fallback** (e.g., Groq/Haiku when Gemini is rate-limited or slow) — v2 (IDEAS-V2-03). Considered under D-01/D-06 as a reliability answer to the latency tail; deliberately not wired for v1. v1 surfaces the tail honestly (RATE_LIMITED / friendly 504) instead.
- **Backend speed-tuning** (fewer Firecrawl results, tighter token cap, dropping the retry) — considered under D-01 and rejected for v1; would trim demand-signal richness for a rare gain.
- **Custom domain** — not required; the default `*.vercel.app` URL is sufficient for v1 / portfolio.
- **Raising `maxDuration` above 60 (Fluid compute)** — not pursued; a 60s+ wait is bad UX regardless, and D-01 accepts the tail rather than extending it.

</deferred>

---

*Phase: 04-deploy-ops*
*Context gathered: 2026-07-01*
