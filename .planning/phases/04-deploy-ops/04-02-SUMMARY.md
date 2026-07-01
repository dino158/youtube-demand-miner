# 04-02 Summary — Live deploy on Vercel (DEPLOY-01, DEPLOY-04)

**Completed:** 2026-07-01
**Requirements:** DEPLOY-01 (live on Vercel free tier), DEPLOY-04 (~20s perf)
**Status:** Complete — app is live, performance verified

## Deploy method (D-05)

**Chosen: Public GitHub repo → Vercel Git import.** The user switched the active GitHub account (from `dino677` to `dino158`) and explicitly confirmed the public-repo action before any push.

- **Repo (public):** https://github.com/dino158/youtube-demand-miner
- **Live URL:** https://youtube-demand-miner.vercel.app
- **Recorded to:** `.planning/phases/04-deploy-ops/DEPLOY-URL.txt`

## Env config (D-06)

Set on the Vercel project (Production) — **names only, values never recorded/committed**:
- `FIRECRAWL_API_KEY` — set
- `GOOGLE_AI_API_KEY` — set
- `LLM_PROVIDER` — `gemini`
- `ANTHROPIC_API_KEY` — **unset** (free Gemini demo)

Evidence the config is correct: the live function returned 10 schema-valid ideas per request, which requires reaching both Firecrawl and Gemini with valid keys.

## Verification

- **Frontend:** `GET /` → HTTP 200; page title `YouTube Demand Miner`; `#generate-form` + `#keyword` present.
- **End-to-end (via API on the live URL):** `POST /api/generate {"keyword":"drone photography"}` → HTTP 200 with 10 ideas.
- **DEPLOY-04 warm performance** (same keyword, warm runs; cold-start warm-up excluded per D-03):

  | Run | HTTP | Time (s) | Ideas |
  |-----|------|----------|-------|
  | warm-up (excluded) | 200 | 12.5 | 10 |
  | 1 | 200 | 13.1 | 10 |
  | 2 | 200 | 12.2 | 10 |
  | 3 | 200 | 12.1 | 10 |
  | 4 | 200 | 16.5 | 10 |

  **Median 12.7s**, range 12.1–16.5s → **PASS** (median < 25s). Honest about free-tier variance (median + range, not a cherry-picked best run).

- **Secret safety during deploy:** no `.env` tracked; no real key in git history (placeholders + documented fake test key only); gitleaks pre-commit hook scanned both deploy commits — no leaks.

## Success criteria status

1. Public Vercel URL works end-to-end — ✅ confirmed via live API (10 ideas). **Real-browser confirmation is the one remaining human check.**
2. Fresh clone works from README alone — ✅ README covers the full zero-context path (04-01).
3. Warm run < 25s — ✅ median 12.7s.
4. No key ever committed — ✅ re-confirmed (04-01 + deploy-commit scan).

## Remaining

- Human real-browser check on https://youtube-demand-miner.vercel.app (type a keyword → confirm cards render, export buttons present).
