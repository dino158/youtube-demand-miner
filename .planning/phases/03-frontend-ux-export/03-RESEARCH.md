# Phase 3: Frontend, UX & Export - Research

**Researched:** 2026-07-01
**Domain:** Astro 5 static shell + vanilla TypeScript client island, consuming an existing synchronous JSON serverless endpoint; clipboard/export APIs
**Confidence:** HIGH

## Summary

This phase wires a UI on top of an **already-complete, already-verified backend** (Phase 2). The contract is not hypothetical — it is live code at `src/pages/api/generate.ts`, `src/lib/types.ts`, and `src/lib/errors.ts`, and it was curl-verified against real Firecrawl/Gemini keys (200, 9 ideas, 13.0s). Research here is less "what library should we use" and more "what exactly does this endpoint do, and what is the correct low-risk pattern to wire a no-framework Astro project against it."

Two findings materially shape the plan. First, **there is no framework installed** (no React/Vue/Svelte integration in `package.json` — only `astro`, `tailwindcss`, and the AI SDK). This means the "client island" for this phase is **not** a framework component with a `client:load` directive — those directives only apply to UI-framework components. The correct Astro 5 pattern for a no-framework project is a plain `<script>` tag (Astro auto-processes it as a TypeScript ES module) either inline in `index.astro` or as an external `src="/src/scripts/app.ts"`-style module, which becomes the "island" by virtue of running only in the browser. Second, **the backend has no streaming** — `generateIdeas()` calls `generateObject` (not `streamObject`) and the orchestrator is one linear `await` chain returning a single JSON body. There is no SSE/chunked response today. This closes the door on "real" streamed progress steps within this phase's scope; the correct, honest recommendation is **client-side simulated timed progress labels**, not backend streaming (which would require rewriting `generate-ideas.ts` and the response contract — out of scope for "wire a client island to the existing `/api/generate`" per the roadmap plan hints).

**Primary recommendation:** Build `index.astro` as the static shell (form, card container, progress/error regions, all initially hidden via CSS) and a single vanilla-TS module script as the client island that does `fetch('/api/generate', { method: 'POST', body: JSON.stringify({ keyword }) })`, drives a client-side timed-label progress sequence, switches on the response's `error.code` for the error taxonomy, and renders cards + wires copy/export buttons. No new dependencies are needed for this phase.

## User Constraints

No `03-CONTEXT.md` exists for this phase (directory is empty at research time — `/gsd:discuss-phase` has not been run, or the phase is proceeding straight to planning). There are no locked decisions or discretion notes to copy verbatim. The binding constraints instead come from `.planning/ROADMAP.md` (phase goal, success criteria, plan hints) and `.planning/PROJECT.md` (project-wide constraints, reproduced below in Project Constraints).

If `/gsd:discuss-phase` runs before planning, its output should be treated as authoritative over the inferences in this document.

## Project Constraints (from CLAUDE.md)

No `CLAUDE.md` exists in the working directory. Project-wide constraints are instead sourced from `.planning/PROJECT.md` and are binding on this phase:

- **Zero paid services** — no new npm dependencies that require a paid tier or API key.
- **Astro static frontend + Tailwind; single serverless function** — do not introduce a UI framework (React/Vue/etc.); do not add a second endpoint.
- **Keys server-only** — the client island must never read or embed `FIRECRAWL_API_KEY`, `GOOGLE_AI_API_KEY`, or `ANTHROPIC_API_KEY`. It only ever talks to `/api/generate`.
- **Multi-page app / heavy framework is explicitly out of scope** — single page, kept small and readable (also an "interview-explainable" portfolio constraint from PROJECT.md § Context).
- **Rate-limiting infrastructure is explicitly out of scope** — the UI must not attempt to implement client-side rate limiting beyond disabling the button while a request is in flight (INPUT-03); the free-tier ceiling is the accepted natural cap.
- **Performance target**: end-to-end keyword → rendered idea list in ~20s (DEPLOY-04, verified in Phase 4, but the UI must not add material client-side latency).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INPUT-01 | Single text field + Generate button + Enter-key submit | Native `<form>` with `<input>` + `<button type="submit">`; Enter key submits forms natively — no JS needed for the Enter-key path, only for `preventDefault()` + fetch wiring |
| INPUT-02 | Prevent empty/<3-char submission, inline feedback, no network request | Client-side length check (`keyword.trim().length < 3`) BEFORE calling fetch; mirrors backend's `z.string().trim().min(3)` in `generate.ts:12` — same rule, client-side short-circuit |
| INPUT-03 | Disable Generate control while in-flight | `button.disabled = true` set synchronously before `fetch()`, reset in a `finally` block |
| UI-01 | Card per idea: title, intent label, rationale | Direct 1:1 with `VideoIdea` shape already defined in `src/lib/types.ts` (`title`, `intent`, `rationale`, `id`) — no new schema needed, reuse the type |
| UI-02 | Step-labeled progress during ~15-25s generation | Backend has no streaming (`generateObject`, not `streamObject`); recommend client-side simulated timed labels — see Progress UX section |
| UI-03 | Specific error messages: rate-limit / network / no-results, never raw error object or blank | Backend already returns `{ error: { code, message } }` with 5 stable codes (`VALIDATION`, `NO_RESULTS`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL`) — switch on `code`, plus a `catch` for `fetch` throwing (network failure has no `code` at all) |
| UI-04 | Mobile-responsive single column, readable at 375px | Tailwind v4 already installed and wired (`@tailwindcss/vite`, `global.css` imports `tailwindcss`) — use utility classes, no new CSS framework |
| EXPORT-01 | Copy all ideas as formatted markdown | `navigator.clipboard.writeText()` with a markdown-formatted string built from the `ideas` array |
| EXPORT-02 | Download all results as JSON | `Blob` + `URL.createObjectURL` + anchor `download` attribute — no server round-trip |
| EXPORT-03 | Copy individual idea to clipboard | Same `navigator.clipboard.writeText()` API, single-idea payload, one listener per card (event delegation recommended) |

## The Existing Backend Contract (verified from source, not assumed)

This is the ground truth Phase 3 must wire against. All of the below is read directly from the live Phase 2 code, not inferred.

### Request
```
POST /api/generate
Content-Type: application/json
Body: { "keyword": string }
```

### Success response — HTTP 200
```typescript
// src/lib/types.ts
{
  ideas: Array<{
    id: string;        // randomUUID(), stable client key
    title: string;      // IDEAS-02
    intent: 'informational' | 'how-to' | 'commercial' | 'comparison'; // IDEAS-03, hyphenated 'how-to'
    rationale: string;  // IDEAS-04, one sentence
  }>
}
```
`ideas.length` is guaranteed between 8 and 12 inclusive (enforced server-side: trim >12 silently, retry once if <8, Zod `.min(8)` as final gate — `generate-ideas.ts:75-86`, `types.ts:22`).

### Error response — non-200, single envelope shape for ALL failures
```typescript
// src/lib/errors.ts — toErrorResponse()
{ error: { code: ErrorCode; message: string } }
```

| `code` | HTTP status | Meaning | When it fires |
|--------|------------|---------|----------------|
| `VALIDATION` | 400 | Keyword missing/empty/<3 chars | Before any network call — returns in 1-4ms (confirmed live in 02-02-SUMMARY) |
| `NO_RESULTS` | 422 | Valid keyword, but Firecrawl returned zero organic results | `generate.ts:50-52` |
| `RATE_LIMITED` | 429 | Firecrawl OR Gemini/Haiku hit a rate limit/quota | `firecrawl.ts:33-35`, `generate-ideas.ts:22-23` — this is the free-tier-ceiling case users will realistically hit |
| `UPSTREAM_ERROR` | 503 | Non-rate-limit upstream failure (5xx, malformed LLM output after retry) | `firecrawl.ts:36-40`, `generate-ideas.ts:26-28,78` |
| `INTERNAL` | 500 | Unclassified/unexpected error, generic message (no internal leak) | `errors.ts:21-24` |

**Critical implication for UI-03:** the backend's error taxonomy already IS rate-limit / network(-adjacent, i.e. `UPSTREAM_ERROR`) / no-results. The frontend does not need to invent its own classification — it needs a `code → user message` map, plus ONE additional case the backend cannot produce: a **true client-side network failure** (`fetch()` itself throws/rejects — e.g., offline, DNS failure, CORS — before any HTTP response exists). That case has no `code` and must be caught separately (see Error Taxonomy section).

**What the backend does NOT do:** it does not stream. It does not send partial results. It does not expose a "step" concept anywhere in the response. There is exactly one JSON body, sent once, after the full ~13-25s pipeline completes.

## Architecture Patterns

### Recommended Project Structure (additions only)
```
src/
├── pages/
│   ├── index.astro          # MODIFIED: static shell — form, progress region, results region, error region
│   └── api/generate.ts      # UNCHANGED (Phase 2, do not touch)
├── scripts/
│   └── app.ts               # NEW: the client island — all fetch/DOM/export logic
├── lib/
│   ├── types.ts             # UNCHANGED — import VideoIdea, Intent from here in app.ts (reuse, don't redefine)
│   └── ... (unchanged Phase 2 files)
└── styles/
    └── global.css           # UNCHANGED (Tailwind v4 already wired)
```

Astro auto-bundles a `<script>` tag's `src` reference relative to the project; conventional placement for client-only TS that isn't a `.astro` component is `src/scripts/`. This keeps `app.ts` fully typed (can `import type { VideoIdea } from '../lib/types'` — type-only import has zero runtime cost and doesn't leak server code into the bundle) and importable/testable outside of Astro's templating.

### Pattern 1: No-framework client island via `<script>` tag
**What:** Because this project has no UI framework installed, the "island" is a plain `<script>` element, not a `client:*` directive on a framework component. `client:load`/`client:idle`/`client:visible` are Astro's hydration directives **for framework components** (React/Vue/Svelte/etc.) — they control when a component's JS framework runtime hydrates. A bare `<script>` in an `.astro` file has no such directive; Astro auto-processes it as a TypeScript ES module and it simply runs when the browser parses it (deferred by default, since `type="module"` scripts are deferred per the HTML spec).
**When to use:** Any time there's no framework component to hydrate — i.e., this entire project.
**Example:**
```astro
---
// src/pages/index.astro
import '../styles/global.css';
---
<html lang="en">
  <body>
    <main>
      <form id="generate-form">
        <input id="keyword" name="keyword" type="text" minlength="3" required />
        <button id="generate-btn" type="submit">Generate</button>
        <p id="input-error" class="hidden" role="alert"></p>
      </form>
      <div id="progress" class="hidden" role="status" aria-live="polite"></div>
      <div id="error" class="hidden" role="alert"></div>
      <div id="results" class="hidden"></div>
    </main>
    <script src="../scripts/app.ts"></script>
  </body>
</html>
```
Source: Astro official docs, "Client-side scripts" — https://docs.astro.build/en/guides/client-side-scripts/ ; "Islands architecture" — https://docs.astro.build/en/concepts/islands/ (confirms hydration directives are for UI-framework components; standard `<script>` tags are the island mechanism for vanilla JS/TS).

### Pattern 2: Fetch against same-origin relative path, no CORS/API-key concerns
**What:** `fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword }) })` — same-origin relative URL. No API keys are ever handled client-side; the browser only ever talks to the site's own serverless function, which is already how `DEPLOY-02` (server-only keys) is enforced upstream in Phase 1/2.
**When to use:** Always, for this endpoint.
**Example:**
```typescript
// src/scripts/app.ts
const res = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword }),
});
const data = await res.json();
if (!res.ok) {
  // data is { error: { code, message } } — see Error Taxonomy
}
```

### Pattern 3: Type reuse across the client/server boundary
**What:** Import `VideoIdea` and `Intent` types from `src/lib/types.ts` into `app.ts` as **type-only imports**. Since `import type` is erased at compile time by TypeScript/esbuild, this creates zero runtime coupling and no risk of server code (or the Zod schemas that reference `astro:env/server`-adjacent modules) leaking into the client bundle — only the type shape survives.
**When to use:** Always — avoids a duplicated, drift-prone `interface VideoIdea` in the client.
**Example:**
```typescript
import type { VideoIdea, Intent } from '../lib/types';
```
**Caveat:** `types.ts` imports `zod` for schema definitions at the top of the file. A `import type` will NOT pull `zod` into the client bundle (TS erases type-only imports entirely), but verify with a build + bundle inspection during implementation that no runtime `zod` import sneaks into the client chunk. If in doubt, the safer alternative is a small hand-written `interface VideoIdea { id: string; title: string; intent: Intent; rationale: string }` colocated in `app.ts` — duplicated but bulletproof against bundle leakage. Given the project's "small and readable" constraint, either is acceptable; recommend attempting the type-only import first and falling back to duplication only if verification shows bundle bloat.

### Anti-Patterns to Avoid
- **Using `client:load` on a plain HTML element or expecting it to do anything without a framework component:** it's a no-op / Astro will warn or ignore it. Don't reach for framework hydration directives in a framework-less project.
- **Re-implementing the 8-12 count check, intent enum, or error code list client-side as new source-of-truth constants:** reuse `types.ts`. Duplicating the `ErrorCode` union as a raw string-literal switch is fine (it's inherently a UI-side mapping), but don't invent new codes the backend doesn't emit.
- **Polling or guessing at "real" progress from the single fetch call:** there is no partial data to poll. Don't build a polling/EventSource client against an endpoint that doesn't support it.
- **Trusting `res.ok` alone without reading the body on failure:** every non-2xx response is guaranteed `{ error: { code, message } }` JSON (never HTML, never empty) per `errors.ts` — always `await res.json()` even on failure paths, then branch on `code`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Copy to clipboard | Manual `document.execCommand('copy')` as the primary path | `navigator.clipboard.writeText()` | Modern async Clipboard API is Baseline-available across Chrome/Edge/Firefox/Safari as of March 2025; `execCommand` is legacy/deprecated. Reserve `execCommand` only as a defensive fallback, not the primary implementation |
| JSON file download | Server-side download endpoint | `Blob` + `URL.createObjectURL()` + `<a download>` | Data already exists client-side (the fetched `ideas` array) — no server round-trip needed, and the project has exactly one serverless function by design (no second endpoint) |
| Markdown formatting for "copy all" | A markdown library dependency | Template-literal string building | Output is a fixed, simple structure (heading + list of title/intent/rationale) — a markdown library is unjustified weight for this |
| Progress step timing | A generic "task queue" or state-machine library | A small array of `{ label, atMs }` driven by `setTimeout`/`setInterval` | The requirement is 3-4 fixed labels over a bounded window — a library is overkill for the "small and readable" constraint |

**Key insight:** every export/copy requirement in this phase is satisfiable with browser-native Web APIs already available in all evergreen browsers. Zero new npm dependencies are justified for Phase 3.

## Progress UX (UI-02): Simulated Timed Labels — Recommended, With Reasoning

**The question:** given the ~15-25s pipeline (13.0s observed live in Phase 2, 60s `maxDuration` ceiling), what's the realistic option for step-labeled progress?

**What the backend actually supports today:** nothing beyond a single blocking JSON response. `generateIdeas()` uses `generateObject` (AI SDK), which is the non-streaming variant — it resolves once with the complete parsed object, or rejects. The orchestrator (`generate.ts`) is a straight-line `await` sequence: validate → Firecrawl (with possible retry) → NO_RESULTS check → parse → `generateIdeas` (with possible retry) → return. There is no intermediate flush, no SSE, no chunked transfer-encoding anywhere in the current code.

**Two real options:**

1. **Real backend streaming (NOT recommended for this phase).** Would require: rewriting `generate-ideas.ts` to use `streamObject` instead of `generateObject`, restructuring the orchestrator to emit interim events (e.g., "Firecrawl done" → "LLM streaming started" → partial-object deltas) over a `ReadableStream`/SSE response, and rewriting the `{ ideas } / { error }` single-JSON-envelope contract that Phase 2 already verified live. Vercel's Node/serverless functions do support streaming responses (confirmed: Vercel supports Web Streams in both Edge and Node serverless environments), so it is *technically* possible — but it is a backend contract change, explicitly outside this phase's scope (the roadmap's plan hint says Phase 3 "wires" the client island "to /api/generate," i.e., against the existing endpoint, not a rebuilt one). It would also reintroduce risk into an endpoint that Phase 2 just finished verifying end-to-end.

2. **Client-side simulated timed step labels (recommended).** The client island fires the single `fetch()`, and in parallel drives a local, cosmetic label sequence via `setTimeout`, e.g.:
   - `0ms`: "Searching pages..."
   - `~4000ms`: "Analyzing content..."
   - `~9000ms`: "Generating ideas..."
   - (optional) `~16000ms`: "Almost done..." (covers the tail toward the observed ~13-25s range without implying false precision)

   When the real `fetch()` resolves (success or error), all pending timeouts are cleared immediately and the UI transitions to the results/error state — so the simulated labels never contradict reality by continuing to show "Generating ideas..." after the response has already landed. This is a standard, well-understood UX pattern for bounded-but-variable-latency operations without true progress data (comparable to how many LLM-wrapping products show canned "thinking" steps during a blocking call).

**Recommendation:** Option 2. It satisfies UI-02's literal requirement ("shows step-labeled progress... not a bare spinner") using only client-side code, touches zero backend files, carries no risk to the already-verified Phase 2 contract, and matches the project's "small and readable" constraint. Implementation detail: use `AbortController`/cleared `setTimeout` handles (not `setInterval`) so labels can be deterministically cancelled the instant the real response arrives — never let a stale label be visible when results or an error are already rendered.

**Confidence:** HIGH that the backend has no streaming today (verified directly from `generate-ideas.ts` and `generate.ts` source). HIGH that Vercel/Astro *could* support streaming if the backend were rewritten (per official Vercel streaming docs). MEDIUM-HIGH that simulated labels are the correct choice for *this phase* specifically — this is a scope judgment grounded in the roadmap's explicit phase boundary, not a technical limitation debate.

## Input Validation UX (INPUT-01/02/03)

- **INPUT-01 (Enter key):** Wrap the input in a `<form>` and listen for `submit` (not just a button `click`). Native HTML forms submit on Enter automatically when there's a single text input — this is browser-default behavior requiring no extra JS. Call `event.preventDefault()` in the `submit` handler to stop a full-page navigation, then run the same validate → fetch logic regardless of whether Enter or the button click triggered submission. This guarantees both trigger paths are always in sync (a common bug is wiring the button's `click` separately from Enter and having them drift).
- **INPUT-02 (min-3-char, no network call):** Mirror the backend rule exactly: `keyword.trim().length < 3`. Perform this check synchronously inside the `submit` handler, BEFORE calling `fetch`. On failure, show inline text (e.g., under the input, `role="alert"` for accessibility) and `return` immediately — no network call is made, satisfying success criterion #1 exactly. Do not rely on the native `minlength="3"` HTML attribute alone for the inline-feedback requirement — browser-native validation UI (the little bubble tooltip) is inconsistent in style across browsers and doesn't give control over message wording; use it as a defense-in-depth attribute but drive the visible inline error text with JS.
- **INPUT-03 (disable while in-flight):** Set `button.disabled = true` synchronously as the very first line after validation passes (before `await fetch(...)`), and reset it (`false`) in a `finally` block that runs on both success and failure paths. This is the standard guard against duplicate submissions/double-spend on free-tier credits. Also consider disabling the text input itself (or at least visually indicating a busy state on the whole form) so a user can't edit the keyword mid-flight and cause confusion about which request the eventual result belongs to.

## Card Rendering (UI-01) + Mobile Responsiveness (UI-04)

- **Rendering approach:** Build each card via `document.createElement`/template-literal `innerHTML` assignment inside a loop over `ideas`, keyed by `idea.id` (already provided by the backend — no need to generate client-side keys). Given "no heavy framework," plain DOM construction or a `<template>` element cloned per card are both idiomatic vanilla-JS patterns; a template-literal string assigned to `container.innerHTML` is the simplest and matches "small and readable," provided all rendered text (title, rationale) is inserted via `textContent`-safe interpolation or escaped — the LLM output is untrusted text and must not be injected as raw HTML (basic XSS hygiene: never `innerHTML = idea.title` directly if title could contain `<script>`; prefer creating elements and setting `.textContent`, or a minimal escape function if using template-literal HTML strings).
- **Single-column at 375px:** Tailwind v4 is already installed and wired via `@tailwindcss/vite` (confirmed in `astro.config.mjs` and `global.css`). Use a mobile-first default of a single-column flex/grid container (`flex flex-col gap-4` or `grid grid-cols-1 gap-4`) with no responsive breakpoint override needed for the 375px case — single-column is the correct default, not something requiring a `sm:`/`md:` override. If a wider desktop view is later desired, that would be an *additive* `md:grid-cols-2` — but the roadmap's success criterion only requires single-column readability at 375px, so don't over-build multi-column layouts speculatively.
- **Intent label styling:** A small badge/pill per intent value is a reasonable minimal treatment (e.g., differing Tailwind background utility per one of the 4 `Intent` enum values) — keeps cards scannable without adding complexity.

## Error Taxonomy (UI-03)

The backend error contract is a closed, 5-value `ErrorCode` union (verified above). The frontend's job is a simple map, plus handling the one case the backend cannot produce (network failure before any response).

| Backend `code` (or client condition) | Recommended user-facing message | Rationale |
|---------------------------------------|----------------------------------|-----------|
| `VALIDATION` (400) | Should be prevented client-side already (INPUT-02); if it somehow reaches here, show the backend's `message` verbatim (it's already a clear string like "Keyword must be at least 3 characters") | Defense in depth — client validation and server validation use the identical rule, so this path should be rare |
| `NO_RESULTS` (422) | "No results found for that keyword — try a broader or different term." | Distinguishes from a generic failure; actionable guidance (try different input) |
| `RATE_LIMITED` (429) | "This tool hit a free-tier rate limit — please try again in a bit." | This is the single most likely real-world failure mode (Gemini free tier: 1,500 req/day; Firecrawl free tier has its own ceiling) — must NOT be confused with a generic error |
| `UPSTREAM_ERROR` (503) | "Something went wrong generating ideas — please try again." | Covers LLM/Firecrawl 5xx and malformed-output-after-retry; generic but honest, not exposing internals |
| `INTERNAL` (500) | "Something unexpected went wrong — please try again." | Backend already strips internal details for this code (`errors.ts:21-24` — non-AppError paths never leak the raw message) |
| `fetch()` itself throws (network/offline/DNS/CORS — `TypeError` from fetch, or the promise rejects before any `Response` exists) | "Can't reach the server — check your connection and try again." | This is the ONE case with no `code` at all, because there was never an HTTP response to parse. Must be caught in a separate `catch` block wrapping the whole `fetch`+`.json()` sequence, distinct from the `if (!res.ok)` branch which handles the 4 backend-classified codes |

**Never show:** a raw `Error` object, `[object Object]`, a stack trace, or a blank/frozen UI. Every failure path — including an unexpected `catch` for a `code` value the frontend doesn't recognize (future-proofing) — must fall through to a generic-but-non-blank message, never leave the UI in an ambiguous "still loading" or empty state.

**Confidence:** HIGH — this section is derived directly from reading `src/lib/errors.ts`, `src/lib/types.ts`, and every throw site in `firecrawl.ts`/`generate-ideas.ts`/`generate.ts`, not from assumption.

## Export/Copy (EXPORT-01/02/03)

### Clipboard API — single-card and markdown-all copy
```typescript
// Source: MDN Clipboard API — https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // caller shows a brief "copy failed" affordance
  }
}
```
- **HTTPS requirement:** `navigator.clipboard` requires a secure context — HTTPS or `localhost`. Vercel deployments are HTTPS by default and `astro dev`/`astro preview` serve on `localhost`, so this is satisfied in both dev and production without extra config. No action needed, but worth stating explicitly since it's a common surprise if ever tested via a raw IP or non-localhost HTTP tunnel.
- **User-activation requirement:** clipboard writes must occur inside a handler triggered by direct user interaction (a click), not from a timer or an unrelated promise resolution. Since both EXPORT-01 (copy-all) and EXPORT-03 (copy-single) are wired to button `click` listeners, this is naturally satisfied — no special handling needed, just don't defer the `writeText()` call into an async callback that's detached from the click's call stack (calling it inside an `async` click handler, awaited directly, is fine and standard).
- **Fallback:** the Clipboard API reached Baseline "Newly available" status (broadly supported in Chrome/Edge/Firefox/Safari) as of March 2025 per MDN/caniuse — a legacy `document.execCommand('copy')` fallback is optional defensive coding, not a hard requirement for this project's target audience (a portfolio piece), but cheap to add: on `catch`, fall back to a hidden-textarea + `execCommand('copy')` attempt, and if that also fails, show "copy failed — please copy manually" with the text visible/selectable.
- **Markdown-all formatting:** build via template literals, e.g. one heading + a `##`/`-` list per idea (title as heading or bold, intent as a bracketed label, rationale as the body line) — no markdown library needed (see Don't Hand-Roll).

### JSON download — Blob + object URL
```typescript
// Source: MDN Blob / URL.createObjectURL — https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename; // e.g. `youtube-ideas-${keyword}.json`
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // release memory — don't skip this
}
```
- No server round-trip needed — the `ideas` array already lives in the client island's memory from the original fetch response.
- `URL.revokeObjectURL()` after triggering the click is a memory-hygiene step commonly omitted; include it (safe to call synchronously right after `a.click()` since the download is triggered by the browser before JS execution continues, per the standard client-side-download pattern).
- Browser support for this whole pattern is universal in evergreen browsers — no caveat needed.

## Common Pitfalls

### Pitfall 1: Reaching for `client:load` on a plain `<script>` or HTML element
**What goes wrong:** Confusing Astro's UI-framework hydration directives with the mechanism for vanilla-JS islands, leading to wasted time trying to add `client:load` to a `<div>` or `<script>` tag expecting it to control loading timing.
**Why it happens:** Most Astro tutorials/examples assume a framework (React/Vue) is installed; this project deliberately has none.
**How to avoid:** A bare `<script>` tag IS the island already — no directive needed or applicable. Control timing (if ever needed) via placement in the document (end of `<body>`) or native `defer`, not a `client:*` attribute.
**Warning signs:** Astro dev server warning/ignoring an unrecognized directive, or no compile error but the directive silently doing nothing.

### Pitfall 2: Treating every non-200 response the same way ("just show a generic error")
**What goes wrong:** Losing the rate-limit vs. no-results vs. upstream-error distinction that the backend already worked to provide, directly failing UI-03's success criterion #4 ("distinguishing rate-limit, network, and no-results cases").
**Why it happens:** It's tempting to write one `catch` block and one generic message for simplicity.
**How to avoid:** Always parse the JSON body on failure and switch on `error.code` — the taxonomy is a simple 5-branch (plus network) switch, not complex logic.
**Warning signs:** A single `catch (err) { showError('Something went wrong') }` with no inspection of `err` or the response body.

### Pitfall 3: Letting simulated progress labels contradict the real response
**What goes wrong:** The response resolves in, say, 8 seconds (fast Firecrawl + fast Gemini), but a `setTimeout`-driven label sequence is still mid-way through "Analyzing content..." when results are already ready to render — or worse, an error arrives and the UI briefly shows a stale progress label before the error message.
**Why it happens:** Timer-driven UI and promise-driven UI run on independent clocks; forgetting to cancel one when the other resolves.
**How to avoid:** Store all `setTimeout` IDs, and in the `.then()`/`finally` of the real fetch, immediately `clearTimeout` every pending label timer before rendering results or the error state.
**Warning signs:** Visually seeing a progress label "flash" briefly after results have already appeared.

### Pitfall 4: Rendering LLM-generated text as raw HTML
**What goes wrong:** LLM output (`idea.title`, `idea.rationale`) is untrusted text. Assigning it via `innerHTML` without escaping opens a (low-severity but real) self-XSS-via-LLM-output vector if the model ever echoes something resembling markup.
**Why it happens:** Template-literal `innerHTML` assignment is the fastest way to render a card and it's easy to forget the text is model-generated, not developer-authored.
**How to avoid:** Use `.textContent` for all LLM-sourced strings (title, rationale, intent) when building DOM nodes, even if the surrounding card *structure* is built via `innerHTML` template strings for the static parts.
**Warning signs:** None visible in normal operation — this is a defense-in-depth practice, not something that will visibly break during typical testing.

### Pitfall 5: Forgetting the request body Content-Type header
**What goes wrong:** `generate.ts`'s `request.json()` will fail to parse (or the body will be treated as text) if `Content-Type: application/json` isn't set on the client's `fetch` call, causing every request to hit the `.catch(() => null)` → `VALIDATION` 400 path even with a valid keyword.
**Why it happens:** Easy to omit when writing a quick `fetch(url, { method: 'POST', body: JSON.stringify(...) })` without headers.
**How to avoid:** Always include `headers: { 'Content-Type': 'application/json' }` on the POST call.
**Warning signs:** Every request returns 400 "Invalid request" regardless of input.

## Code Examples

### Full validate → fetch → render skeleton
```typescript
// src/scripts/app.ts
import type { VideoIdea } from '../lib/types';

const form = document.getElementById('generate-form') as HTMLFormElement;
const input = document.getElementById('keyword') as HTMLInputElement;
const button = document.getElementById('generate-btn') as HTMLButtonElement;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const keyword = input.value.trim();

  if (keyword.length < 3) {
    showInlineError('Keyword must be at least 3 characters');
    return; // INPUT-02: no network request
  }
  clearInlineError();

  button.disabled = true; // INPUT-03
  const stopProgress = startSimulatedProgress(); // UI-02

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(mapErrorCode(data.error.code, data.error.message));
      return;
    }
    renderCards(data.ideas as VideoIdea[]);
  } catch {
    // fetch() itself threw — no HTTP response exists (offline/DNS/network)
    showError("Can't reach the server — check your connection and try again.");
  } finally {
    stopProgress();
    button.disabled = false;
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `document.execCommand('copy')` as primary clipboard method | `navigator.clipboard.writeText()` (async Clipboard API) | Baseline "Newly available" March 2025 | `execCommand` is legacy; use only as a defensive fallback, not the primary path |
| Framework-hydration directives (`client:load` etc.) assumed universal for "making things interactive" in Astro | Directives apply only to registered UI-framework integrations; vanilla `<script>` tags remain the island mechanism when no framework is installed | Ongoing (Astro 5, current) | Don't cargo-cult `client:*` syntax into a framework-less project |

**Deprecated/outdated:** none specific to this phase beyond the clipboard fallback note above — this is a small, stable surface area (native Web APIs + an already-verified backend contract).

## Open Questions

1. **Exact wording/tone of user-facing error and progress copy**
   - What we know: the taxonomy (which code → which category) is fully determined by the backend.
   - What's unclear: exact microcopy is a product/writing choice, not a technical one.
   - Recommendation: the planner/implementer can finalize exact strings; the mappings and cancellation-safety behavior in this document are the load-bearing parts.

2. **Whether to keep progress labels purely time-based or add a soft cap/fallback for slow responses**
   - What we know: observed live latency was 13.0s; the `maxDuration` ceiling is 60s.
   - What's unclear: what the last visible label should say if the response takes, say, 40s (rare but possible on a cold Vercel function or slow upstream).
   - Recommendation: after the last scheduled label (e.g., ~16s "Almost done..."), simply hold on that final label rather than scheduling further timed steps — avoids inventing more granular fake steps for an indeterminate tail, and avoids the label sequence running out and reverting to a bare state before the real response arrives.

3. **Card layout on wider viewports (tablet/desktop)**
   - What we know: the only hard requirement (UI-04) is single-column readability at 375px.
   - What's unclear: whether a multi-column desktop layout is desired now or deferred.
   - Recommendation: default single-column everywhere is compliant and simplest; treat any wider-viewport grid enhancement as optional polish, not a requirement gap.

## Environment Availability

No new external dependencies are introduced by this phase. All required capabilities (Clipboard API, Blob/URL APIs, fetch, Astro's script processing, Tailwind) are either already installed in this repo (confirmed via `package.json`: `astro@5.18.2`, `tailwindcss@4.3.2`, `@tailwindcss/vite@4.3.2`) or are native browser APIs requiring no installation. The one environmental factor to note:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Secure context (HTTPS or localhost) | Clipboard API (EXPORT-01, EXPORT-03) | ✓ | — | Vercel prod is HTTPS by default; `astro dev`/`preview` serve on localhost — both satisfy the requirement automatically |
| Existing `/api/generate` endpoint | All fetch wiring | ✓ | live-verified 200/13.0s in 02-02-SUMMARY | None needed — endpoint is complete and verified |

No missing dependencies, blocking or otherwise.

## Sources

### Primary (HIGH confidence)
- Direct source read: `src/pages/api/generate.ts`, `src/lib/types.ts`, `src/lib/errors.ts`, `src/lib/firecrawl.ts`, `src/lib/generate-ideas.ts`, `src/lib/llm-provider.ts`, `src/lib/demand-parser.ts` — the entire backend contract, verified against live code, not documentation
- `.planning/phases/02-backend-pipeline/02-VERIFICATION.md` — confirms live curl results (200, 9 ideas, 13.0s; 400 validation in 1-4ms)
- `package.json`, `astro.config.mjs`, `tsconfig.json`, `vercel.json`, `src/styles/global.css` — confirmed installed versions and existing configuration
- MDN — Clipboard API: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
- MDN — URL.createObjectURL: https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
- Astro official docs — Client-side scripts: https://docs.astro.build/en/guides/client-side-scripts/
- Astro official docs — Islands architecture: https://docs.astro.build/en/concepts/islands/
- Astro official docs — Template directives reference: https://docs.astro.build/en/reference/directives-reference/
- Vercel official — Streaming for serverless Node.js and Edge runtimes: https://vercel.com/blog/streaming-for-serverless-node-js-and-edge-runtimes-with-vercel-functions

### Secondary (MEDIUM confidence)
- Clipboard API Baseline status (March 2025, cross-browser support) — cross-referenced across MDN and caniuse search results
- AbortController/timer cancellation patterns for cancelling simulated progress — cross-referenced across multiple community sources (Better Stack, MDN AbortSignal), consistent with each other

### Tertiary (LOW confidence)
- None flagged — all findings for this phase were either verified directly against the repo's source code or cross-checked against official docs (Astro, MDN, Vercel).

## Metadata

**Confidence breakdown:**
- Backend contract (request/response shapes, error codes, statuses): HIGH — read directly from live, already-verified source code, not inferred
- Astro island architecture pattern (no-framework, plain `<script>`): HIGH — confirmed against official Astro docs; directly explains why `client:*` directives don't apply here
- Progress UX recommendation (simulated vs. real streaming): HIGH on the technical facts (backend doesn't stream today), MEDIUM-HIGH on the scope judgment (recommending against a backend rewrite this phase) — grounded in the roadmap's explicit phase boundary
- Clipboard/export APIs: HIGH — native, Baseline-stable Web APIs, behavior confirmed via MDN

**Research date:** 2026-07-01
**Valid until:** 30 days (stable browser APIs + a locked, already-verified backend contract; low volatility)
