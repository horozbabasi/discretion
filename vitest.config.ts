import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Let tests run straight from TypeScript source without a prior `tsc -b`.
      // (The compiled workspace packages point at dist/ via their package.json.)
      '@discretion/data': fileURLToPath(
        new URL('./packages/data/src/index.ts', import.meta.url),
      ),
      '@discretion/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
      '@discretion/eval': fileURLToPath(
        new URL('./packages/eval/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Deterministic property tests: see packages/core/test/setup.fastcheck.ts.
    setupFiles: ['packages/core/test/setup.fastcheck.ts'],
  },
});
