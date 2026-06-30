---
phase: 01-scaffold-security
plan: 01
subsystem: scaffold
tags: [astro, vercel, tailwind, env-security, gitleaks]
dependency_graph:
  requires: []
  provides: [astro-scaffold, vercel-adapter, tailwind-v4, env-schema, gitleaks-hook]
  affects: [02-api-integration]
tech_stack:
  added:
    - astro@5.18.2
    - "@astrojs/vercel@9.0.5"
    - tailwindcss@4.3.2
    - "@tailwindcss/vite@4.3.2"
  patterns:
    - output:static + prerender=false per-route (Astro 5 hybrid replacement)
    - astro:env schema for server-only secret enforcement
    - Tailwind v4 CSS-first via @tailwindcss/vite Vite plugin
    - gitleaks pre-commit hook (non-blocking-if-absent)
key_files:
  created:
    - astro.config.mjs
    - src/pages/index.astro
    - src/pages/api/generate.ts
    - src/styles/global.css
    - vercel.json
    - .env.example
    - .gitignore
    - .git/hooks/pre-commit
    - package.json
    - tsconfig.json
  modified: []
decisions:
  - "Used @astrojs/vercel@9.0.5 (not v11) — v11 requires Astro 7, v9 is the last Astro 5-compatible release"
  - "output:static (not hybrid — removed in Astro 5) with prerender=false on API endpoint"
  - "Vercel adapter creates single _render.func (not per-route functions) — vercel.json key src/pages/api/generate.ts may need updating at deploy time (Phase 4)"
  - "Cleared npm cache (1.8GB) to resolve ENOSPC error during build — disk was at 99.9% capacity"
metrics:
  duration: "7m 48s"
  completed: "2026-06-30"
  tasks: 3
  files_created: 10
requirements: [DEPLOY-02]
---

# Phase 01 Plan 01: Scaffold & Security Summary

Astro 5.18.2 scaffold with Vercel adapter, Tailwind v4, astro:env server-only secret schema, 60s timeout, and gitleaks pre-commit hook — DEPLOY-02 fully satisfied.

## What Was Built

- **Astro 5.18.2 scaffold** in the repo root (not a subdirectory). Minimal template scaffolded to temp dir and moved in to work around non-empty directory restriction.
- **@astrojs/vercel@9.0.5** — Astro 5-compatible adapter. v11 (the research target) requires Astro 7 — used v9, the latest Astro 5 release.
- **Tailwind v4** via `@tailwindcss/vite` Vite plugin. CSS-first: `@import "tailwindcss"` in global.css. No tailwind.config.js.
- **astro:env schema** declaring all 4 env vars with `context:'server'` — FIRECRAWL_API_KEY, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY (all secret), LLM_PROVIDER (public). All `optional:true` for Phase 1 build without real keys.
- **maxDuration:60** in both adapter config (astro.config.mjs) and vercel.json (belt-and-suspenders).
- **api/generate.ts stub** — `export const prerender = false` on line 1, no astro:env/server import.
- **gitleaks@8.30.1** installed via brew; pre-commit hook proven to block staged `AIzaSy...` keys with exit 1.

## Installed Versions

| Package | Version | Notes |
|---------|---------|-------|
| astro | 5.18.2 | Locked decision: Astro 5 (not 6/7) |
| @astrojs/vercel | 9.0.5 | Latest Astro 5-compatible (v11 requires Astro 7) |
| tailwindcss | 4.3.2 | v4 |
| @tailwindcss/vite | 4.3.2 | Vite plugin — correct v4 integration |
| gitleaks | 8.30.1 | Installed via brew |

## Function Output Path

The Vercel adapter emits a **single** `_render.func` at `.vercel/output/functions/_render.func/` — NOT per-route functions like `api/generate.func`. This means the `vercel.json` key `"src/pages/api/generate.ts"` targets the source file path (accepted by Vercel), but the **actual deployed function name** is `_render`. This is normal for Astro's adapter pattern.

**Flag for Phase 4 deploy:** Verify at deploy time that Vercel correctly maps the `src/pages/api/generate.ts` key to the `_render` function. If not, the vercel.json key may need updating to `"api/generate"` or similar.

## Gitleaks Status

- gitleaks 8.30.1 installed successfully via `brew install gitleaks`
- Pre-commit hook installed at `.git/hooks/pre-commit`, executable
- **Leak-catch test PASSED:** Staging a file with `AIzaSyB1234567890abcdefghijklmnopqrstuvw` caused the hook to exit non-zero (1 leak found), blocking the commit
- Working tree left clean after test (no artifacts committed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm create astro scaffolded to dreary-dwarf/ subdirectory**
- **Found during:** Task 1
- **Issue:** `npm create astro@latest . --template minimal` refused the non-empty directory and created `dreary-dwarf/` subdirectory
- **Fix:** Scaffolded to subdirectory then moved files to repo root (preserved .planning/ and .git/), then removed temp dir
- **Files modified:** All scaffold files landed at repo root as required
- **Commit:** 3b07d89

**2. [Rule 3 - Blocking] @astrojs/vercel v11 requires Astro 7 (peer dep conflict)**
- **Found during:** Task 1 npm install
- **Issue:** `@astrojs/vercel@11.0.0` declares `peer astro@"^7.0.0-alpha.0"` — incompatible with pinned astro@5
- **Fix:** Used `@astrojs/vercel@9.0.5` — the latest release with `peer astro@"^5.0.0"`. The consolidated import path `import vercel from '@astrojs/vercel'` works in v9 (the `.` export points to `./dist/index.js`)
- **Impact:** The research noted "v11" but the core requirement was "no /serverless subpath" — v9 satisfies that
- **Commit:** 3b07d89

**3. [Rule 3 - Blocking] ENOSPC disk space failure during first build**
- **Found during:** Task 2 initial `astro build`
- **Issue:** Disk at 99.9% capacity (185MB free). The Vercel adapter copies `sharp-libvips` (~16MB) into the function bundle during build
- **Fix:** Cleared npm cache (`npm cache clean --force`, reclaimed ~1.8GB), removed partial .vercel/ and dist/ output, retried build successfully
- **Commit:** 07cbe51 (build verified after fix)

**4. [Rule 1 - Bug] prerender=false on line 2 (after comment on line 1)**
- **Found during:** Phase-level verification
- **Issue:** File started with `// src/pages/api/generate.ts` comment on line 1, `export const prerender = false` on line 2 — acceptance criterion requires first line
- **Fix:** Moved export to line 1, comment to line 3
- **Commit:** d7dbb24

## Known Stubs

- `src/pages/api/generate.ts` — returns `{ stub: true, ideas: [] }` hardcoded. This is intentional Phase 1 behavior. Phase 2 wires the real Firecrawl + LLM pipeline.
- `src/pages/index.astro` — "Placeholder — Phase 3 wires the UI." Intentional Phase 1 behavior.

These stubs do NOT prevent the plan's goal (scaffold + security), which is fully achieved.

## Success Criteria Status

| Criterion | Status | Evidence |
|-----------|--------|---------|
| astro dev starts without errors, serves placeholder at localhost | PASS | `DEV_OK at 4321` — curl returned YouTube Demand Miner |
| astro build exits 0, static frontend + serverless function | PASS | Build complete; _render.func + index.html emitted |
| No API key in browser bundle (DEPLOY-02) | PASS | NO_SECRETS_IN_BUNDLE — grep found nothing in .vercel/output/static/ |
| .env gitignored, .env.example ships placeholders, real key caught | PASS | gitleaks hook blocks AIzaSy... key (exit 1, "1 leak found") |
| vercel.json maxDuration:60 (pipeline cannot 504) | PASS | maxDuration:60 in both astro.config.mjs and vercel.json |

## Self-Check: PASSED

All required files exist and all task commits are present in git history:
- astro.config.mjs, src/pages/index.astro, src/pages/api/generate.ts, src/styles/global.css — FOUND
- vercel.json, .env.example, .gitignore — FOUND
- .git/hooks/pre-commit — FOUND and EXECUTABLE
- Commits: 3b07d89 (Task 1), 07cbe51 (Task 2), 5f29f8d (Task 3), d7dbb24 (fix) — all FOUND
