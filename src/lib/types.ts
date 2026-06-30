import { z } from 'zod';

// Search-intent label (IDEAS-03). Exactly these four values, hyphen in 'how-to'.
export const IntentEnum = z.enum(['informational', 'how-to', 'commercial', 'comparison']);
export type Intent = z.infer<typeof IntentEnum>;

// Schema sent TO the LLM — deliberately has NO id and NO array-level .min()/.max().
// Per D-07 / research pitfall #2 (vercel/ai#9202): models do not reliably honor
// minItems/maxItems, so count enforcement happens in code (Task 3), not in this schema.
export const VideoIdeaLLMSchema = z.object({
  title: z.string(),                 // IDEAS-02: suggested video title
  intent: IntentEnum,                 // IDEAS-03
  rationale: z.string(),              // IDEAS-04: one-sentence rationale
});

// Client-facing schema: adds a stable id (Claude's-discretion field for client keys).
export const VideoIdeaSchema = VideoIdeaLLMSchema.extend({ id: z.string() });
export type VideoIdea = z.infer<typeof VideoIdeaSchema>;

// Final defense-in-depth gate before responding: enforce the 8-floor here.
// This is NOT the retry trigger (that is code-level in generate-ideas.ts).
export const VideoIdeaListSchema = z.array(VideoIdeaSchema).min(8);

// Stable, machine-readable error codes (D-05). Phase 3 switches on these, never on message strings.
export type ErrorCode = 'VALIDATION' | 'NO_RESULTS' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INTERNAL';
