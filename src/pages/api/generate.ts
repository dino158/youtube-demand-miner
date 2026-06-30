export const prerender = false; // MUST stay first — makes this a serverless function

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { searchFirecrawl } from '../../lib/firecrawl';
import { buildDemandContext } from '../../lib/demand-parser';
import { generateIdeas } from '../../lib/generate-ideas';
import { AppError, toErrorResponse } from '../../lib/errors';

// VALIDATION (D-05 -> 400). Enforced BEFORE any external API call (success criterion #5).
const RequestSchema = z.object({
  keyword: z.string().trim().min(3, 'Keyword must be at least 3 characters'),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// D-06: retry Firecrawl ONCE on transient (UPSTREAM_ERROR thrown by 5xx/network),
// NEVER on RATE_LIMITED (429). searchFirecrawl already classifies status -> AppError.
async function fetchWithRetry(keyword: string) {
  try {
    return await searchFirecrawl(keyword);
  } catch (err) {
    const rateLimited = err instanceof AppError && err.code === 'RATE_LIMITED';
    const transient =
      (err instanceof AppError && err.code === 'UPSTREAM_ERROR') ||
      err instanceof TypeError; // network-level fetch failure
    if (transient && !rateLimited) {
      await sleep(500);
      return await searchFirecrawl(keyword);
    }
    throw err;
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Validate request body BEFORE any external call (D-05 VALIDATION -> 400)
    const body = await request.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request');
    }
    const { keyword } = parsed.data;

    // 2. Firecrawl demand fetch (DEMAND-01), retry-once on transient (D-06)
    const webResults = await fetchWithRetry(keyword);

    // 3. NO_RESULTS guard (D-05 -> 422) — distinct from a 200 empty array (Pitfall #5).
    //    Also short-circuits before spending an LLM call/credit.
    if (webResults.length === 0) {
      throw new AppError('NO_RESULTS', `No organic results found for "${keyword}"`);
    }

    // 4. Build token-capped demand context (DEMAND-02)
    const demandContext = buildDemandContext(webResults);

    // 5. Generate count-enforced, schema-validated ideas (IDEAS-01..05, D-07/D-09)
    const ideas = await generateIdeas(demandContext, keyword);

    // 6. Success envelope (D-04)
    return new Response(JSON.stringify({ ideas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Single source of the error envelope + D-05 status mapping.
    return toErrorResponse(err);
  }
};
