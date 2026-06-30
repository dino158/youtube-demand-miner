import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { LLM_PROVIDER, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY } from 'astro:env/server';
import type { LanguageModel } from 'ai';
import { AppError } from './errors';

export function getModel(): LanguageModel {
  if (LLM_PROVIDER === 'haiku') {
    if (!ANTHROPIC_API_KEY) throw new AppError('INTERNAL', 'ANTHROPIC_API_KEY is not configured');
    const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY });
    return anthropic('claude-haiku-4-5');
  }
  // default: gemini (truly $0)
  if (!GOOGLE_AI_API_KEY) throw new AppError('INTERNAL', 'GOOGLE_AI_API_KEY is not configured');
  const google = createGoogleGenerativeAI({ apiKey: GOOGLE_AI_API_KEY });
  return google('gemini-2.5-flash');
}
