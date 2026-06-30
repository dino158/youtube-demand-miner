import type { FirecrawlWebResult } from './firecrawl';

const CHARS_PER_TOKEN = 4;
const TOKEN_CAP = 8000;
const CHAR_CAP = TOKEN_CAP * CHARS_PER_TOKEN; // ~32,000 chars

// Assemble organic titles + snippets into a compact, numbered demand-context string,
// capped to ~8,000 tokens before sending to the LLM (D-03 / DEMAND-02).
export function buildDemandContext(results: FirecrawlWebResult[]): string {
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}`);
  let context = lines.join('\n');
  if (context.length > CHAR_CAP) {
    context = context.slice(0, CHAR_CAP);
  }
  return context;
}
