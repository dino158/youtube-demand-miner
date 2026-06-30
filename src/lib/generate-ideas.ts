import { generateObject, NoObjectGeneratedError, APICallError } from 'ai';
import { randomUUID } from 'node:crypto';
import { VideoIdeaLLMSchema, VideoIdeaListSchema, type VideoIdea } from './types';
import { getModel } from './llm-provider';
import { AppError } from './errors';

function buildPrompt(keyword: string, demandContext: string): string {
  return [
    `You are a YouTube content strategist. A creator wants video ideas for the niche: "${keyword}".`,
    `Below are the top Google organic results (titles and snippets) showing what people are actively searching for:`,
    ``,
    demandContext,
    ``,
    `Generate between 8 and 12 distinct YouTube video ideas grounded in this real search demand.`,
    `Return them ranked best-first (array order is the ranking; no numeric score).`,
    `For each idea: a compelling video title, the primary search intent`,
    `(informational, how-to, commercial, or comparison), and a one-sentence rationale for why it earns watch time.`,
  ].join('\n');
}

function classifyLLMError(err: unknown): AppError {
  if (APICallError.isInstance(err) && err.statusCode === 429) {
    return new AppError('RATE_LIMITED', 'LLM provider rate limit or quota reached');
  }
  if (NoObjectGeneratedError.isInstance?.(err) ?? err instanceof NoObjectGeneratedError) {
    return new AppError('UPSTREAM_ERROR', 'LLM returned malformed output');
  }
  return new AppError('UPSTREAM_ERROR', 'LLM request failed');
}

function isTransient(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    return err.statusCode !== 429 && (err.isRetryable ?? (err.statusCode ?? 0) >= 500);
  }
  return err instanceof TypeError; // network-level fetch failure
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateOnce(keyword: string, demandContext: string): Promise<VideoIdea[]> {
  const { object } = await generateObject({
    model: getModel(),
    output: 'array',
    schema: VideoIdeaLLMSchema,
    schemaName: 'VideoIdeas',
    schemaDescription: 'A list of YouTube video ideas grounded in search demand.',
    prompt: buildPrompt(keyword, demandContext),
  });
  // object is VideoIdeaLLMSchema[] (no id yet)
  return object.map((idea) => ({ ...idea, id: randomUUID() }));
}

async function callLLM(keyword: string, demandContext: string): Promise<VideoIdea[]> {
  try {
    return await generateOnce(keyword, demandContext);
  } catch (err) {
    // 429 must NOT retry (D-06); transient errors retry once then surface.
    if (APICallError.isInstance(err) && err.statusCode === 429) throw classifyLLMError(err);
    if (isTransient(err)) {
      await sleep(500);
      try {
        return await generateOnce(keyword, demandContext);
      } catch (retryErr) {
        throw classifyLLMError(retryErr);
      }
    }
    throw classifyLLMError(err);
  }
}

export async function generateIdeas(demandContext: string, keyword: string): Promise<VideoIdea[]> {
  let ideas = await callLLM(keyword, demandContext);

  // D-07: under-count -> ONE retry of the LLM call
  if (ideas.length < 8) {
    ideas = await callLLM(keyword, demandContext);
    if (ideas.length < 8) {
      throw new AppError('UPSTREAM_ERROR', 'LLM returned too few ideas after retry');
    }
  }

  // D-07: over-count -> silent trim to 12
  const trimmed = ideas.length > 12 ? ideas.slice(0, 12) : ideas;

  // Defense-in-depth final gate (IDEAS-05): never let a broken count reach the client.
  return VideoIdeaListSchema.parse(trimmed);
}
