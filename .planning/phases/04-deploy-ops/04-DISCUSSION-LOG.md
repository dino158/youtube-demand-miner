# Phase 4: Deploy & Ops - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 04-deploy-ops
**Areas discussed:** Performance vs. free-tier timeout (selected). Deploy method, README depth, and Live provider/env were presented but not deep-dived — defaults locked.

---

## Gray-area selection

| Area | Description | Selected |
|------|-------------|----------|
| Perf vs. timeout | Gemini ~69s spikes vs. 60s Hobby cap and <25s target; how to reconcile + how to verify | ✓ |
| Deploy method | Git-connected (GitHub) vs. Vercel CLI vs. dashboard | |
| README depth | Minimal quickstart vs. portfolio-grade | |
| Live provider/env | Gemini-only vs. also wiring Haiku | |

**User's choice:** Perf vs. timeout only.

---

## Performance vs. free-tier timeout

### Q1 — Reconciling <25s target with ~69s tail spikes

| Option | Description | Selected |
|--------|-------------|----------|
| Accept & document | Typical warm runs ~13s already pass; keep maxDuration:60, verify against typical runs, document the $0 variance tradeoff in README; no new code | ✓ |
| Tune for speed | Fewer Firecrawl results / tighter token cap / drop the retry to shrink the tail; still $0, more work, trims demand richness | |
| Haiku for live URL | Run public deploy on Anthropic Haiku for consistent latency; breaks '$0 for the live demo' | |

**User's choice:** Accept & document.
**Notes:** Preserves the $0 principle; the ~69.4s spike is a rare tail, typical is ~13s.

### Q2 — What counts as DEPLOY-04 verified (under 25s warm)

| Option | Description | Selected |
|--------|-------------|----------|
| Median of 3–5 runs | Same keyword several times warm; report median + range; median < 25s passes | ✓ |
| Single warm run | One clean warm invocation < 25s is sufficient | |
| Best-case demo run | Capture one good run for portfolio; ignore the tail | |

**User's choice:** Median of 3–5 warm runs.
**Notes:** Honest about variance; good portfolio evidence. Cold-start runs excluded (criterion is "warm").

### Q3 — 504 / gateway-timeout behavior in the deployed app

| Option | Description | Selected |
|--------|-------------|----------|
| Friendly error | Extend Phase 3 taxonomy so a 504 maps to "free tier is busy — try again"; small frontend touch-up | ✓ |
| Accept as-is | Leave handling; document rare 504 as known edge in README; no code change | |
| You decide | Let planning pick within the existing taxonomy | |

**User's choice:** Friendly error.
**Notes:** The one currently-unhandled failure mode; function can't catch its own maxDuration kill, so handled client-side on the fetch response.

---

## Defaulted areas (presented, user chose "Ready for context")

| Area | Default locked | Flag |
|------|----------------|------|
| Deploy method | GitHub push → Vercel import (Git-connected, auto-deploy) | CONFIRM before executing — creates a public repo (outward-facing). Fallback: `npx vercel --prod`. |
| README depth | Portfolio-grade: quickstart + architecture + free-API-key walkthrough + $0/latency notes | — |
| Live provider/env | Gemini-only on Vercel; Anthropic key left unset/optional | — |

**User's choice:** "Ready for context" — accepted the three defaults as documented in CONTEXT.md (D-05, D-06, D-07).

---

## Claude's Discretion

- README section ordering, prose, screenshots/GIFs.
- Exact 504 friendly-error wording.
- Keyword used for the DEPLOY-04 median measurement and how evidence is recorded.
- Whether to keep or remove the moot `vercel.json` per-route maxDuration key.

## Deferred Ideas

- Automatic provider fallback (Groq/Haiku on rate-limit) — v2 (IDEAS-V2-03).
- Backend speed-tuning — rejected for v1.
- Custom domain — not required; `*.vercel.app` is sufficient.
- Raising maxDuration above 60 (Fluid compute) — not pursued.
