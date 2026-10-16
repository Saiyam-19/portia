import base from './vitest.config';
import { defineConfig } from 'vitest/config';

// Focused audit regressions, also included by the default test command.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/audit/**/*.audit.{ts,tsx}'],
    setupFiles: ['tests/audit/no-network.ts'],
    maxWorkers: 2,
  },
});
