// src/pages/api/generate.ts
export const prerender = false;  // MUST be first — makes this a serverless function

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ stub: true, ideas: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
