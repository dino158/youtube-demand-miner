import { FIRECRAWL_API_KEY } from 'astro:env/server';
import { AppError } from './errors';

const FIRECRAWL_SEARCH_URL = 'https://api.firecrawl.dev/v2/search';

export interface FirecrawlWebResult {
  title: string;
  description: string;
  url: string;
}

export async function searchFirecrawl(keyword: string): Promise<FirecrawlWebResult[]> {
  if (!FIRECRAWL_API_KEY) {
    throw new AppError('INTERNAL', 'FIRECRAWL_API_KEY is not configured');
  }
  const res = await fetch(FIRECRAWL_SEARCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: keyword,
      limit: 10,                 // D-02: 10 organic results
      sources: [{ type: 'web' }],
      // D-01/D-03: page-content-fetch / JSON-extraction / stealth-proxy options
      // are intentionally OMITTED entirely (not passed as {}) to preserve the credit budget.
    }),
  });

  if (!res.ok) {
    // D-05 status branching on HTTP status ONLY (Pitfall #4):
    if (res.status === 429) {
      throw new AppError('RATE_LIMITED', 'Firecrawl rate limit or quota reached');
    }
    if (res.status >= 500) {
      // transient — let the orchestrator's retry-once wrapper decide (D-06)
      throw new AppError('UPSTREAM_ERROR', `Firecrawl returned ${res.status}`);
    }
    throw new AppError('UPSTREAM_ERROR', `Firecrawl request failed (${res.status})`);
  }

  const json = await res.json();
  return (json.data?.web ?? []) as FirecrawlWebResult[];
}
