# Phase 2: Backend Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 02-backend-pipeline
**Areas discussed:** Demand-signal depth, Backend error contract, Resilience & count enforcement

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Demand-signal depth | /search titles+snippets only vs. also scraping top-page content; how many results | ✓ |
| VideoIdea shape & ranking | Field set, meaning of "ranked", stable id | |
| Backend error contract | Status codes + structured error body for Phase 3 | ✓ |
| Resilience & count enforcement | Retry policy; handling <8 or >12 ideas | ✓ |

**User's choice:** Demand-signal depth, Backend error contract, Resilience & count enforcement
**Notes:** VideoIdea shape left to Claude's discretion with a sensible default recorded in CONTEXT.md.

---

## Demand-signal depth

### Fetch depth

| Option | Description | Selected |
|--------|-------------|----------|
| Titles + snippets only | One /search call, ~1 credit, fastest | ✓ |
| Snippets + scrape top 3 pages | Richer context, ~4 credits, +latency | |
| Snippets + scrape top 5 pages | Richest signal, ~6 credits, highest timeout risk | |

**User's choice:** Titles + snippets only
**Notes:** Snippets are dense demand signal; stays within ~20s budget and free-tier credits. Page scraping deferred to v2.

### Result count

| Option | Description | Selected |
|--------|-------------|----------|
| 10 results | Broad signal, under ~8k token cap | ✓ |
| 5 results | Leaner/cheaper, risks repetitive ideas | |
| 20 results | Max breadth, more tokens, dilutes signal | |

**User's choice:** 10 results

---

## Backend error contract

### Error shape

| Option | Description | Selected |
|--------|-------------|----------|
| { error: { code, message } } | Structured envelope, machine-readable code | ✓ |
| { error: "message string" } | Simplest, but brittle string-matching | |
| Top-level { code, message, ideas? } | Flat shape, mixes success/error fields | |

**User's choice:** { error: { code, message } }

### No-results handling

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct error: 422 + NO_RESULTS | Handled failure with its own code | ✓ |
| 200 with empty ideas: [] | Frontend special-cases empty array | |

**User's choice:** 422 + code NO_RESULTS

### Rate-limit handling

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP 429 + RATE_LIMITED | Honest semantic, distinct from other upstream errors | ✓ |
| HTTP 503 + UPSTREAM_ERROR | Lumps rate-limits with all upstream failures | |

**User's choice:** HTTP 429 + code RATE_LIMITED

---

## Resilience & count enforcement

### Retry policy

| Option | Description | Selected |
|--------|-------------|----------|
| One retry on transient errors only | Single backoff retry on 5xx/network, not 429 | ✓ |
| Fail fast, no retry | Simplest, more brittle | |
| Retry everything incl. rate-limits | Re-hits quota wall, wastes time budget | |

**User's choice:** One retry on transient errors only (never on 429)

### Idea-count enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Trim if >12; retry once then error if <8 | Trim excess; one retry then UPSTREAM_ERROR; Zod floor of 8 | ✓ |
| Strict: any count outside 8–12 → error | Rejects a good 13-idea response | |
| Accept whatever validates (≥1 idea) | Violates 8–12 success criterion | |

**User's choice:** Trim if >12; retry once then error if <8

---

## Claude's Discretion

- VideoIdea field set (title/intent/rationale + stable id, ranked order = array order)
- Structured-output mechanism (AI SDK `generateObject` + Zod)
- Prompt design
- Snippet/demand-context truncation under ~8k cap
- Internal module/file layout
- Exact retry backoff duration

## Deferred Ideas

- Scraping top-page content (v2)
- Automatic provider fallback / Groq (v2 — IDEAS-V2-03)
- SerpApi PAA/related searches (v2 — DEMAND-V2-01)
- VideoIdea shape deep-dive / per-card demand annotation (v2 — DEMAND-V2-02)
