# YouTube Demand Miner

Turn what people are already searching for on Google into demand-grounded YouTube video ideas.

Enter a keyword or niche, and the app returns a ranked list of **8–12 concrete video concepts** — each with a suggested title, the search intent behind it, and a one-line rationale for why it should earn watch time. Instead of guessing topics, you get ideas anchored to real Google search demand.

It bridges two workflows that are normally disconnected — SEO keyword research and YouTube content planning — and it runs entirely on **free tiers ($0)**.

> **Why it exists:** a content creator needs topics with *proven* demand, not hunches. The whole thing is also small and readable on purpose — it doubles as a portfolio/interview piece you can walk through end to end.

---

## Quickstart

A fresh clone reaches a working dev environment in five steps — no undocumented setup.

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd <repo>

# 2. Install dependencies (requires Node >= 22.12.0)
npm install

# 3. Create your local env file from the template
cp .env.example .env

# 4. Open .env and fill in FIRECRAWL_API_KEY and GOOGLE_AI_API_KEY
#    (both are free — see "Getting free API keys" below)

# 5. Start the dev server, then open the printed localhost URL
npm run dev
```

`npm run dev` runs `astro dev`. Once it prints a `http://localhost:4321` URL, open it, type a keyword (e.g. `drone photography`), and click **Generate**.

> Node **>= 22.12.0** is required (see `engines` in `package.json`).

---

## Getting free API keys

Both providers have genuinely free tiers and neither requires a credit card to start.

**1. Firecrawl** — the demand-signal source (fetches Google organic results).
- Sign up at <https://firecrawl.dev>
- Free tier: **1,000 credits/month**
- Copy your key into `FIRECRAWL_API_KEY` in `.env`

**2. Google AI Studio** — the default LLM (Gemini 2.5 Flash).
- Create a key at <https://aistudio.google.com> (no credit card)
- Free tier: **1,500 requests/day**
- Copy your key into `GOOGLE_AI_API_KEY` in `.env`

> ⚠️ **Important:** **never enable billing on that Google project** — it removes the free tier and you can start being charged per token. Keep the AI Studio project on its free plan.

---

## Environment variables

All keys are **server-only** — they live only as serverless-function environment variables, are never committed, and are never `PUBLIC_`-prefixed, so they never reach the browser bundle. The repo ships `.env.example` with placeholders; your real values go in `.env` (which is gitignored).

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `FIRECRAWL_API_KEY` | Yes | Firecrawl free-tier key — fetches Google organic results |
| `GOOGLE_AI_API_KEY` | Yes (default provider) | Google AI Studio key for Gemini 2.5 Flash |
| `ANTHROPIC_API_KEY` | Only when `LLM_PROVIDER=haiku` | Anthropic key (paid) — leave unset for the free demo |
| `LLM_PROVIDER` | No (defaults to `gemini`) | `gemini` (free, default) or `haiku` (paid, needs `ANTHROPIC_API_KEY`) |

---

## Deploy to Vercel (free tier)

The app runs as a **static Astro frontend + a single serverless function** on Vercel's **hobby (free) tier** — no paid services, no database.

1. Push this repo to GitHub.
2. Import it at <https://vercel.com/new> (Git-connected → auto-deploys on every push).
3. In **Vercel → Project → Settings → Environment Variables**, set exactly three for **Production**:
   - `FIRECRAWL_API_KEY` = your Firecrawl key
   - `GOOGLE_AI_API_KEY` = your Google AI Studio key
   - `LLM_PROVIDER` = `gemini`
   - Leave `ANTHROPIC_API_KEY` **unset** for the free demo.
4. Trigger a deploy (push, or redeploy from the dashboard) **after** the env vars are set so the function has its keys.

**CLI fallback (no GitHub):** run `npx vercel --prod`, then add the same env vars with `npx vercel env add`.

> Keys go **only** into the Vercel project env — never into a committed file. `.gitignore` already excludes `.env` and `.vercel/`, and a gitleaks pre-commit hook guards against accidental key commits.

---

## How it works

The whole pipeline is one round trip through a single serverless function — simple enough to explain in an interview:

1. **Browser** posts the keyword to `POST /api/generate` (a single serverless function; the frontend never holds a key).
2. **Firecrawl `/v2/search`** fetches the top Google **organic results** (titles + snippets) for that keyword — this is the real demand signal. (Google blocks direct SERP scraping / People-Also-Ask, so organic results are the $0 path.)
3. **Demand parser** condenses those results into a token-capped context block.
4. **LLM** (default **Gemini 2.5 Flash** via the Vercel AI SDK) synthesizes the demand signal into 8–12 ranked ideas — each a `{ title, intent, rationale }`, validated with Zod.
5. **Frontend** renders the ideas as clean cards with intent badges, plus copy-as-Markdown and download-as-JSON export.

**Swappable provider by design:** the LLM sits behind a thin factory keyed on `LLM_PROVIDER`. Switch between `gemini` and `haiku` with **no code change** — just an env var. Validation, the NO_RESULTS guard, and the retry-once-on-transient logic all live in the function, before any idea is returned.

**Stack:** Astro 5 (`output: 'static'` + `prerender = false` on the API route) · Tailwind CSS · Vercel adapter (single consolidated `_render.func`, `maxDuration: 60`) · Vercel AI SDK · Zod.

---

## Performance & cost

- **Cost: $0.** Runs entirely on free tiers (Firecrawl 1,000 credits/mo, Google AI Studio 1,500 req/day, Vercel hobby).
- **Typical warm latency: ~15–20s** end-to-end (keyword → rendered idea list). A live Phase 2 run returned 9 ideas in ~13s.
- **Occasional free-tier spikes** (rare tail runs of 60s+) are a **known limitation of the free tier, not a defect.** The app surfaces them honestly — a 504 shows a friendly "the free tier is busy, try again" message rather than a raw error.
- **Want consistent low latency?** Set `LLM_PROVIDER=haiku` (Anthropic Haiku) — a one-env-var swap that trades $0 for steadier response times. Gemini remains the free default.
