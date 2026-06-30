# Phase 1: Scaffold & Security — Research

**Researched:** 2026-06-30
**Domain:** Astro 5 + @astrojs/vercel hybrid scaffold, astro:env security, Tailwind v4, vercel.json timeout, env hygiene
**Confidence:** HIGH (all critical API details verified against official Astro docs, Vercel docs, and npm registry)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-02 | All API keys are read only from server-side environment variables — none are committed or exposed in the browser bundle | astro:env schema with context:"server" access:"secret" blocks PUBLIC_ exposure at type level; .gitignore + gitleaks pre-commit hook prevents accidental commit |

</phase_requirements>

---

## Summary

Phase 1 stands up the Astro 5 + Vercel scaffold with two guarantees: the pipeline cannot 504 (vercel.json + adapter maxDuration), and no API key can reach the browser bundle (astro:env schema enforced at the type system level, not just by convention). These are infrastructure decisions that, if done wrong, require full rewrites later — they must be correct from commit one.

The most important clarification for this phase: the roadmap uses the language `output: 'hybrid'` but this value **was removed in Astro 5**. The correct Astro 5 approach is `output: 'static'` (the default) with `export const prerender = false` on individual server routes. This achieves identical behavior — static pages + one serverless API function — without the removed `hybrid` value. The planner must use `output: 'static'`, not `output: 'hybrid'`.

A secondary but important finding: the Vercel official docs still show `@astrojs/vercel/serverless` as the import path in some examples, but this path was removed in @astrojs/vercel v10 (shipping as v11 on npm). The correct import is `import vercel from '@astrojs/vercel'`. The planner must use the consolidated path.

**Primary recommendation:** Scaffold with `npm create astro@latest`, set `output: 'static'` (NOT 'hybrid'), add `@astrojs/vercel` adapter, define secrets in `astro:env` schema with `context: "server", access: "secret"`, set `maxDuration: 60` in the adapter config, and protect against accidental commits with a gitleaks pre-commit hook.

---

## CRITICAL: 'hybrid' Output Removed in Astro 5

**This is the single most important thing to get right in this phase.**

The roadmap and existing project research use `output: 'hybrid'` throughout. This value **no longer exists in Astro 5**.

| Astro Version | 'hybrid' Value | Correct Approach |
|---------------|----------------|------------------|
| Astro 4 | Valid — static default, per-page opt-out with `prerender = false` | — |
| Astro 5 | **REMOVED** — merged into 'static' | Use `output: 'static'` (or omit entirely, it's the default) |

**What happened:** PR #11824 merged `output: 'hybrid'` into `output: 'static'`. The behavior is identical — pages are static by default, individual routes opt into server rendering with `export const prerender = false`. No behavioral change, just the config value was renamed.

**Official Astro 5 docs say:** Valid values are `'static'` | `'server'`. `'hybrid'` is not listed.

**What to use for this project:**
```js
// astro.config.mjs
export default defineConfig({
  // output: 'static' is the DEFAULT — can be omitted entirely
  // DO NOT write output: 'hybrid' — Astro 5 does not accept this value
  adapter: vercel({ maxDuration: 60 }),
});
```

The API endpoint then opts out of prerendering:
```ts
// src/pages/api/generate.ts
export const prerender = false; // This makes it a serverless function
export const POST: APIRoute = async ({ request }) => { ... };
```

**Confidence:** HIGH — verified against official Astro 5 configuration reference which lists only 'static' and 'server', and against the PR that merged hybrid into static.

---

## Standard Stack

### Core (Phase 1 installs)

| Library | Verified Version | Purpose | Source |
|---------|-----------------|---------|--------|
| astro | 7.0.4 | Frontend framework, SPA shell | `npm view astro version` |
| @astrojs/vercel | 11.0.0 | Vercel adapter (serverless + static) | `npm view @astrojs/vercel version` |
| tailwindcss | 4.3.2 | Utility CSS | `npm view tailwindcss version` |
| @tailwindcss/vite | 4.3.2 | Vite plugin — the ONLY correct Tailwind v4 integration for Astro | `npm view @tailwindcss/vite version` |

> Note: The existing STACK.md documents `astro@5.x` as the target. The npm registry currently shows `7.0.4` as latest. This version gap needs resolution in the plan — either pin to the last Astro 5.x release or accept 7.x. The project decision from STATE.md says "Astro 5 (not 6)" specifically to avoid @astrojs/vercel SSR esbuild bugs in v6. Whether these same bugs exist in v7 is UNKNOWN. The plan should either: (a) pin `astro@5` explicitly (`npm install astro@5`), or (b) verify @astrojs/vercel v11 is compatible with astro@7. **Safest path: `npm install astro@5` to honor the locked decision.**

> Note on `create-astro` version: `npm view create-astro version` returns `5.2.1` (the CLI tool version, not the Astro framework version). `npm create astro@latest` will scaffold using whatever Astro version the CLI targets at time of install.

### NOT Used in Phase 1 (context for planner)
These ship in Phase 2, but the Phase 1 `.env.example` and `astro:env` schema must define their variable names:

| Variable | Used By | Type |
|----------|---------|------|
| `FIRECRAWL_API_KEY` | Phase 2 Firecrawl integration | server secret |
| `GOOGLE_AI_API_KEY` | Phase 2 Gemini provider | server secret |
| `ANTHROPIC_API_KEY` | Phase 2 Haiku swap-in (optional) | server secret |
| `LLM_PROVIDER` | Phase 2 provider factory | server public (not a secret) |

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 creates)

```
project-root/
├── src/
│   ├── pages/
│   │   ├── index.astro           # Placeholder home page (Phase 1 stub)
│   │   └── api/
│   │       └── generate.ts       # Placeholder API stub (Phase 1 stub)
│   └── styles/
│       └── global.css            # @import "tailwindcss";
├── .env                          # Real keys — gitignored
├── .env.example                  # Placeholder values — committed
├── .git/hooks/pre-commit         # gitleaks check — not tracked in git
├── astro.config.mjs              # Adapter + maxDuration + Tailwind + env schema
├── vercel.json                   # maxDuration backup (belt-and-suspenders)
├── package.json
└── tsconfig.json
```

### Pattern 1: Astro 5 Static + One Serverless Endpoint

**What:** `output: 'static'` (default) with the Vercel adapter. All `.astro` pages prerender to static HTML at build time. Any file that exports `export const prerender = false` becomes a serverless Vercel function.

**Why:** The "hybrid" terminology from the roadmap maps exactly to this pattern — it's just the Astro 5 name for it. Nothing is architecturally different.

```js
// astro.config.mjs — CORRECT Astro 5 config
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';         // v11 consolidated path — NOT /serverless
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // output: 'static' is default — omit or include, same result
  adapter: vercel({
    maxDuration: 60,  // seconds; 60 is safe budget for ~20s pipeline
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      FIRECRAWL_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      GOOGLE_AI_API_KEY: envField.string({ context: 'server', access: 'secret' }),
      ANTHROPIC_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      LLM_PROVIDER:      envField.string({ context: 'server', access: 'public',  default: 'gemini' }),
    },
  },
});
```

### Pattern 2: API Endpoint as Serverless Function

```ts
// src/pages/api/generate.ts — Phase 1 stub
export const prerender = false;  // REQUIRED — omitting this makes it static HTML, not a function

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ stub: true, ideas: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

**Critical:** `export const prerender = false` MUST be the first export in the file. Without it, with `output: 'static'`, the endpoint is statically rendered at build time and returns empty HTML — it works in `astro dev` but silently breaks in production.

### Pattern 3: astro:env Schema for Server Secrets

The `astro:env` module (stable in Astro 5, no longer experimental) enforces env var access at the TypeScript type level:

- Variables declared `context: 'server'` are inaccessible from client-side code — importing `astro:env/server` in a client script throws a build error
- Variables declared `access: 'secret'` are excluded from the build output bundle
- `PUBLIC_`-prefixed variables are blocked unless explicitly declared `context: 'client'`

```ts
// In src/pages/api/generate.ts (server-side only)
import { FIRECRAWL_API_KEY, GOOGLE_AI_API_KEY } from 'astro:env/server';

// FIRECRAWL_API_KEY is now available as a string — TypeScript knows its type
// Attempting to import this in a <script> tag or client file = build error
```

**Validation behavior:** `astro:env` validates env var presence at startup. If `FIRECRAWL_API_KEY` is declared without `optional: true` and the variable is absent from the environment, Astro throws a build-time or runtime error before any request is processed. This is the correct behavior — fail loudly rather than silently.

**getSecret():** For variables NOT in the schema (dynamic lookups), `getSecret('VAR_NAME')` from `astro:env/server` is available as a runtime escape hatch.

### Pattern 4: vercel.json maxDuration (Belt-and-Suspenders)

The primary `maxDuration` is set in `astro.config.mjs` via the adapter. A `vercel.json` entry is belt-and-suspenders insurance:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/pages/api/generate.ts": {
      "maxDuration": 60
    }
  }
}
```

**Important clarification from Vercel docs (verified 2026-06-19):**

The Vercel Hobby plan with Fluid Compute enabled (default for new projects) allows **300 seconds** maximum. Setting `maxDuration: 60` is **not** hitting a limit — it's setting an explicit budget that is well within the 300s ceiling. The 60s budget matches the ~20s pipeline with a comfortable 3x safety margin.

The Vercel docs show the correct function key pattern for Astro: `"src/pages/api/generate.ts"` (with `src/pages/api/` prefix, not just `api/`). Verify the generated function path after first build.

**Also note:** The Vercel docs show Astro examples still using `@astrojs/vercel/serverless` — this is outdated documentation. The correct import in v11 is `import vercel from '@astrojs/vercel'`.

---

## Anti-Patterns to Avoid

- **`output: 'hybrid'`** — Astro 5 does not accept this value. Use `output: 'static'` or omit (it's the default).
- **`import vercel from '@astrojs/vercel/serverless'`** — Removed in v10/v11. Use `import vercel from '@astrojs/vercel'`.
- **`@astrojs/tailwind`** — Deprecated for Tailwind v4. Use `@tailwindcss/vite` Vite plugin directly.
- **`PUBLIC_FIRECRAWL_API_KEY`** — Never prefix secrets with `PUBLIC_`. With `astro:env`, declaring a variable as `context: 'server'` is the type-safe guard; `PUBLIC_` prefix bypasses it.
- **Omitting `export const prerender = false`** — With `output: 'static'`, the endpoint silently prebuilds to a static file. Works in `astro dev`, breaks in production.
- **No `maxDuration` config** — Default Vercel timeout for some scaffolds may still be 10s. Set it explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var type safety | Manual `process.env` with runtime checks | `astro:env` schema | Build-time enforcement, TypeScript types, prevents PUBLIC_ leaks |
| Secret scanning | Regex grep in pre-commit | gitleaks | Covers 150+ secret patterns out of the box |
| Serverless timeout config | Custom SIGTERM handler | `maxDuration` in adapter config | Platform-native, no code needed |
| CSS utility classes | Custom CSS modules | Tailwind v4 via `@tailwindcss/vite` | Single import, no config file needed in v4 |

---

## Common Pitfalls

### Pitfall 1: 'hybrid' output value causes Astro 5 config error

**What goes wrong:** Using `output: 'hybrid'` in `astro.config.mjs` on Astro 5 throws a config validation error or is silently ignored.

**Why it happens:** The roadmap and prior research docs use 'hybrid' throughout. It was valid in Astro 4 but was merged into 'static' for Astro 5. Developers copy from docs/tutorials that predate the change.

**How to avoid:** Use `output: 'static'` (or omit — it's the default). Add `export const prerender = false` to any server-side endpoint.

**Warning signs:** Astro config validation error on startup. Or, API endpoint silently returns static HTML in production.

### Pitfall 2: Old @astrojs/vercel import path causes build failure

**What goes wrong:** `import vercel from '@astrojs/vercel/serverless'` throws a module resolution error at build time.

**Why it happens:** The `/serverless` subpath was removed in @astrojs/vercel v10. Many tutorials and the official Vercel docs still show the old path (the Vercel docs page fetched 2026-06-15 still shows `@astrojs/vercel/serverless` in some examples).

**How to avoid:** Always `import vercel from '@astrojs/vercel'` (no subpath). Verified from the package's `exports` map: the only top-level export is `.` → `./dist/index.js`.

**Warning signs:** `ERR_PACKAGE_PATH_NOT_EXPORTED` or `Cannot find module '@astrojs/vercel/serverless'` during build.

### Pitfall 3: prerender = false missing — API endpoint builds as static file

**What goes wrong:** The endpoint `src/pages/api/generate.ts` compiles to a static HTML/JSON file at build time. POST requests return 405 or the prebuilt content.

**Why it happens:** With `output: 'static'`, all pages prerender unless explicitly opted out. `astro dev` uses SSR for everything, so this bug is invisible locally.

**How to avoid:** First line of every server endpoint file must be `export const prerender = false;`. Make this a project template rule verified before every commit.

**Warning signs:** `curl -X POST https://deploy.url/api/generate` returns HTML or 405 instead of JSON. Works fine with `astro dev`.

### Pitfall 4: astro:env declared variables missing at runtime cause hard startup failure

**What goes wrong:** If `FIRECRAWL_API_KEY` is in the schema without `optional: true` and the `.env` file is not present (fresh deploy, missing env var on Vercel), the import of `astro:env/server` throws immediately, crashing the function on first request.

**Why it happens:** astro:env validates declared required secrets on first import, not lazily. This is the intended behavior (fail loudly), but it can bite during scaffold setup when placeholder variables haven't been added to the Vercel environment yet.

**How to avoid:** During Phase 1, all variables in the schema should be set to `optional: true` OR real placeholder values should be added to Vercel dashboard env vars before the first deploy. The `.env.example` shows what values are needed; a pre-deploy checklist step should verify they exist.

### Pitfall 5: Vercel docs Astro examples show outdated import paths

**What goes wrong:** Developer follows the official Vercel docs (https://vercel.com/docs/frameworks/frontend/astro) which as of 2026-06-15 still shows `import vercel from '@astrojs/vercel/serverless'` and `output: 'server'` with `output: 'hybrid'` appearing in the SSR section.

**Why it happens:** Vercel's documentation lags behind the adapter's own changelog. The adapter's package `exports` map confirms only `'.'` is exported from the top level — no `/serverless` subpath exists.

**How to avoid:** Source config from the Astro docs (docs.astro.build), not the Vercel docs, for the adapter integration details.

---

## Code Examples

Verified patterns from official sources:

### Complete astro.config.mjs for Phase 1
```js
// Source: docs.astro.build/en/guides/integrations-guide/vercel/ + docs.astro.build/en/guides/environment-variables/
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // output: 'static' is the default — explicit for clarity
  output: 'static',
  adapter: vercel({
    maxDuration: 60,
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      FIRECRAWL_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_AI_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ANTHROPIC_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      LLM_PROVIDER:      envField.string({ context: 'server', access: 'public', default: 'gemini', optional: true }),
    },
  },
});
```

> Phase 1 marks all env vars `optional: true` so the scaffold builds without real keys. Phase 2 removes `optional: true` from required vars once keys are confirmed available.

### Placeholder API endpoint stub
```ts
// Source: docs.astro.build/en/guides/endpoints/ + docs.astro.build/en/guides/integrations-guide/vercel/
// src/pages/api/generate.ts
export const prerender = false;  // MUST be first — makes this a serverless function

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ stub: true, ideas: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

### Tailwind v4 CSS import
```css
/* Source: tailwindcss.com/docs/installation/framework-guides/astro */
/* src/styles/global.css */
@import "tailwindcss";
```

### Placeholder index page
```astro
---
// src/pages/index.astro — Phase 1 placeholder
import '../styles/global.css';
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>YouTube Demand Miner</title>
  </head>
  <body class="min-h-screen bg-gray-50">
    <main class="max-w-2xl mx-auto p-8">
      <h1 class="text-3xl font-bold">YouTube Demand Miner</h1>
      <p class="mt-2 text-gray-600">Placeholder — Phase 3 wires the UI.</p>
    </main>
  </body>
</html>
```

### vercel.json (belt-and-suspenders timeout)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/pages/api/generate.ts": {
      "maxDuration": 60
    }
  }
}
```

### .env.example
```bash
# YouTube Demand Miner — required environment variables
# Copy to .env and fill in real values before running astro dev

# Firecrawl API key (https://firecrawl.dev — free tier, 1,000 credits/month)
FIRECRAWL_API_KEY=fc-placeholder

# Google AI Studio key (https://aistudio.google.com — free tier, no credit card)
GOOGLE_AI_API_KEY=AIzaSy-placeholder

# Anthropic API key — only needed when LLM_PROVIDER=haiku (requires paid plan)
ANTHROPIC_API_KEY=sk-ant-placeholder

# LLM provider: 'gemini' (default, free) or 'haiku' (paid, requires ANTHROPIC_API_KEY)
LLM_PROVIDER=gemini
```

### .gitignore entries
```
# Environment files — NEVER commit real keys
.env
.env.local
.env.*.local

# Build output
dist/
.vercel/
```

### gitleaks pre-commit hook (lightest viable option, no framework required)
```bash
# .git/hooks/pre-commit — chmod +x required
#!/usr/bin/env bash
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "WARNING: gitleaks not installed. Skipping secret scan." >&2
  echo "Install: brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks" >&2
  exit 0  # Non-blocking if not installed — developer chose not to install
fi

gitleaks protect --staged --redact
```

> The hook is non-blocking if gitleaks is not installed (exit 0). This avoids blocking solo developers who haven't installed it. For team use, change to `exit 1` to enforce. The `--redact` flag prevents the actual key value from appearing in the error output.

> Install gitleaks on macOS: `brew install gitleaks`
> gitleaks is NOT installed on this machine (verified via `which gitleaks`). The plan must include an install step.

---

## Installation Sequence

```bash
# 1. Scaffold minimal Astro project
npm create astro@latest youtube-demand-miner -- --template minimal --no-install
cd youtube-demand-miner

# 2. Pin to Astro 5 (locked project decision — not Astro 6 or 7)
# Check what version 'latest' produced, then pin if needed:
cat package.json | grep '"astro"'
# If not 5.x: npm install astro@5

# 3. Add Vercel adapter
npm install @astrojs/vercel

# 4. Add Tailwind v4 (Vite plugin path — NOT @astrojs/tailwind)
npm install tailwindcss @tailwindcss/vite

# 5. Install all dependencies
npm install

# 6. Verify builds
npx astro build
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| Node.js | Astro 5 scaffold | Yes | v25.8.1 | Astro 5 requires Node 20+; v25 is fine |
| npm | Package management | Yes | 11.11.0 | Current |
| gitleaks | Pre-commit secret scan | No | — | Must be installed: `brew install gitleaks` |
| Vercel CLI | Build verification | Not checked | — | Optional for Phase 1; `npm i -g vercel` if needed |

**Missing dependencies with no fallback:**
- gitleaks: The success criteria require "a real key committed by mistake is caught before push." The plan must include `brew install gitleaks` as an explicit step or document that the hook is optional but recommended.

**Missing dependencies with fallback:**
- Vercel CLI: `npx vercel build` works without a global install for build verification.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for This Project |
|--------------|------------------|--------------|------------------------|
| `output: 'hybrid'` | `output: 'static'` + per-route `prerender = false` | Astro 5.0 (Nov 2024) | MUST use 'static', not 'hybrid' |
| `import vercel from '@astrojs/vercel/serverless'` | `import vercel from '@astrojs/vercel'` | @astrojs/vercel v10 | MUST use consolidated path |
| `@astrojs/tailwind` integration | `@tailwindcss/vite` Vite plugin | Tailwind v4.0 (early 2025) | MUST NOT install @astrojs/tailwind |
| Manual `process.env` access | `astro:env` schema with type enforcement | Astro 4.10 (stable in Astro 5) | Use envField.string for all secrets |
| `tailwind.config.js` config file | No config file needed (CSS-first config) | Tailwind v4.0 | No tailwind.config.js needed in v4 |

**Deprecated/outdated:**
- `@astrojs/tailwind`: Deprecated for Tailwind v4. No updates being made. Do not install.
- `@astrojs/vercel/serverless` import path: Removed in v10. Build fails if used.
- `output: 'hybrid'`: Removed in Astro 5. Config validation rejects it.

---

## Open Questions

1. **Astro version to pin**
   - What we know: `npm view astro version` returns 7.0.4. The locked project decision says "Astro 5 (not 6)." Astro 7 was not mentioned in the original research.
   - What's unclear: Whether @astrojs/vercel v11 has the same esbuild SSR issues on Astro 7 as v6 had.
   - Recommendation: Honor the locked decision. Pin `astro@5` explicitly (`npm install astro@5`) to avoid uncertainty. The planner should not upgrade to 7 without explicit verification.

2. **vercel.json function path pattern**
   - What we know: Vercel docs show `"src/pages/api/generate.ts"` as the key pattern for Astro.
   - What's unclear: Whether the Vercel adapter transforms this path or whether the output function path differs.
   - Recommendation: After first `vercel build`, check `.vercel/output/functions/` to confirm the function name and update vercel.json if the path doesn't match.

3. **astro:env optional: true in Phase 1**
   - What we know: Required env vars declared without `optional: true` fail at import if absent.
   - What's unclear: Whether the Phase 1 stub endpoint imports from `astro:env/server` at all (if it doesn't, validation is deferred to Phase 2 when real imports are added).
   - Recommendation: The Phase 1 stub should NOT import from `astro:env/server` — it returns a hardcoded stub response. Declare all vars as `optional: true` in Phase 1 regardless, to prevent any surprise build failures.

---

## Sources

### Primary (HIGH confidence — official documentation, verified 2026-06-30)
- https://docs.astro.build/en/reference/configuration-reference/#output — Astro 5 output values: 'static' | 'server' only
- https://docs.astro.build/en/guides/on-demand-rendering/ — `export const prerender = false` pattern, output: 'static' approach
- https://docs.astro.build/en/guides/integrations-guide/vercel/ — @astrojs/vercel v11 import path, maxDuration adapter config
- https://docs.astro.build/en/guides/environment-variables/ — astro:env schema, envField.string, context/access, astro:env/server import
- https://tailwindcss.com/docs/installation/framework-guides/astro — @tailwindcss/vite Vite plugin, @import "tailwindcss"
- https://vercel.com/docs/functions/configuring-functions/duration — maxDuration schema, Hobby plan 300s ceiling (updated 2026-06-19)
- https://vercel.com/docs/frameworks/frontend/astro — Astro on Vercel framework guide (updated 2026-06-15)
- npm registry: `npm view astro version` → 7.0.4, `npm view @astrojs/vercel version` → 11.0.0, `npm view tailwindcss version` → 4.3.2, `npm view @tailwindcss/vite version` → 4.3.2

### Secondary (MEDIUM confidence — cross-referenced)
- https://github.com/withastro/astro/pull/11824 — PR merging output: 'hybrid' into output: 'static' for Astro 5
- https://astro.build/blog/astro-5/ — Astro 5.0 release notes confirming hybrid merge
- https://github.com/gitleaks/gitleaks — gitleaks README and pre-commit setup
- https://www.d4b.dev/blog/2026-02-01-gitleaks-pre-commit-hook/ — Minimal pre-commit hook without frameworks (2026-02-01)
- npm package exports map: `npm view @astrojs/vercel@11 exports` — confirms no `/serverless` export in v11

### Tertiary (LOW confidence — context only)
- Vercel docs Astro examples: noted as containing outdated `@astrojs/vercel/serverless` references — do not follow for import path

---

## Metadata

**Confidence breakdown:**
- 'hybrid' → 'static' migration: HIGH — verified against official Astro 5 config reference and release PR
- @astrojs/vercel v11 import path: HIGH — verified against npm exports map and official adapter docs
- astro:env schema API: HIGH — verified against official Astro docs
- Tailwind v4 Vite plugin: HIGH — verified against official Tailwind Astro guide
- maxDuration config: HIGH — verified against official Vercel function duration docs (updated 2026-06-19)
- gitleaks pre-commit hook: MEDIUM — approach verified, exact gitleaks version/behavior may vary

**Research date:** 2026-06-30
**Valid until:** 2026-09-30 (stable ecosystem; Astro/Vercel adapter versioning can shift faster — re-verify before executing if >30 days pass)
