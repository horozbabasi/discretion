import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Let tests run straight from TypeScript source without a prior `tsc -b`.
      // (The compiled workspace packages point at dist/ via their package.json.)
      '@privacyshield/data': fileURLToPath(
        new URL('./packages/data/src/index.ts', import.meta.url),
      ),
      '@privacyshield/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
