import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Paid end-to-end runs only; never part of the default test command.
const env = loadEnv('', process.cwd(), '');
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/eval/**/*.eval.ts'],
    setupFiles: [],
    env: { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY ?? '', BERTHWISE_MODEL: process.env.BERTHWISE_MODEL ?? env.BERTHWISE_MODEL ?? '', LLM_ALLOW_PAID: 'true' },
  },
});
