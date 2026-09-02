import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Workspace packages are aliased to their TypeScript SOURCE so `vite dev` and
// `vite build` run without a prior `tsc -b` (the same trick the root
// vitest.config.ts uses). Vite resolves the `.js` specifiers inside those
// packages back to `.ts` because the importers are TypeScript files.
const pkg = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@discretion/data': pkg('../data/src/index.ts'),
      '@discretion/core': pkg('../core/src/index.ts'),
      '@discretion/eval': pkg('../eval/src/index.ts'),
    },
  },
  build: {
    // `dist/` belongs to `tsc -b` (type artifacts); the site bundle goes to
    // `build/`, which .gitignore already covers.
    outDir: 'build',
    target: 'es2022',
  },
});
