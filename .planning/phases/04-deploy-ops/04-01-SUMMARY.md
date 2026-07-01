# 04-01 Summary — Pre-deploy prep (README, 504 handling, key-safety)

**Completed:** 2026-07-01
**Requirements:** DEPLOY-03 (README), DEPLOY-04 (504 UX support); DEPLOY-02 re-confirmation
**Status:** Complete — build passes, all acceptance criteria met

## What changed

- **`src/scripts/app.ts`** — added a client-side `if (res.status === 504)` branch BEFORE `await res.json()`, mapping the Vercel gateway timeout to a friendly "The free tier is busy right now — please try again in a moment." message (D-04). Additive only; the existing `mapError` switch, network `catch`, and `finally` are unchanged. The function cannot catch its own `maxDuration` kill, so this is handled purely client-side.
- **`README.md`** (new, 111 lines) — portfolio-grade: overview + core value, `## Quickstart` (clone → `npm install` → `cp .env.example .env` → fill keys → `npm run dev`), `## Getting free API keys` (Firecrawl + Google AI Studio, with the "never enable billing" warning), `## Environment variables` (mirrors `.env.example`), `## Deploy to Vercel (free tier)` (GitHub import + the three D-06 env vars, `ANTHROPIC_API_KEY` unset, CLI fallback), `## How it works` (scrape → parse → LLM → cards; swappable provider), `## Performance & cost` ($0, ~15–20s typical, `LLM_PROVIDER=haiku` swap).
- **`vercel.json`** — removed the moot `functions` block keyed on `src/pages/api/generate.ts` (the adapter emits a single `_render.func`, so that key never matched; adapter `maxDuration: 60` is authoritative). Reduced to `{ "$schema": "https://openapi.vercel.sh/vercel.json" }`.

## DEPLOY-02 key-safety evidence (success criterion #4)

- `git ls-files | grep -E '(^|/)\.env$'` → **no tracked `.env`** (only `.env.example`).
- `git log -p` key-pattern scan → every match is a **placeholder** (`fc-placeholder`, `AIzaSy-placeholder`, `sk-ant-placeholder`) or the **documented fake test key** (`AIzaSyB1234567890abcdefghijklmnopqrstuvw`) used in Phase 1 to prove the gitleaks hook. **No real key value in any commit.**
- `.gitignore` excludes `.env` and `.vercel/`; gitleaks `pre-commit` hook present (`.git/hooks/pre-commit`).
- `README.md` contains no real key values (placeholders only).

## Verification

- `npm run build` → exit 0 (Node 25→24 runtime fallback warning is expected; matches `_render.func` nodejs24.x).
- README acceptance greps all pass (all required headings present, `never enable billing`, `cp .env.example .env`, `LLM_PROVIDER=haiku`, key names present, ≥80 lines).

## Next

04-02: create the public GitHub repo (pending user confirmation of account `dino677`), push, import into Vercel, set the three D-06 env vars, verify the live flow.
