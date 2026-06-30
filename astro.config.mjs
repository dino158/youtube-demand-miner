import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // output: 'static' is the default — explicit for clarity
  output: 'static',
  adapter: vercel({
    maxDuration: 60,
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      FIRECRAWL_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_AI_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ANTHROPIC_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      LLM_PROVIDER:      envField.string({ context: 'server', access: 'public', default: 'gemini', optional: true }),
    },
  },
});
