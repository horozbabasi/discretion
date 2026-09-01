// ESLint flat config for the whole monorepo.
// Prettier owns formatting; eslint-config-prettier (last entry) disables any
// stylistic rules that would fight with it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      // The offscreen-lifetime probe: a throwaway EXTENSION, not project code.
      // It is loaded into a browser by its own manifest, so it runs under
      // chrome-extension globals that this config has no reason to define for
      // the repo at large, and it is committed as evidence for a measurement
      // rather than as something anyone imports. See its README.
      'packages/extension/scripts/offscreen-probe/ext/**',
      // Live-probe bundle: generated dev-tool output, never shipped or edited.
      '**/.probe/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.hf-cache/**',
      // Generated data (large; owned by their generator scripts).
      'packages/data/src/confusables.ts',
      'packages/data/src/gazetteers.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `any` is banned project-wide. Use `unknown` and narrow.
      '@typescript-eslint/no-explicit-any': 'error',
      // Offset-map hot loops index typed arrays with proven-in-bounds indices;
      // with noUncheckedIndexedAccess enabled, `!` is the sanctioned escape hatch.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // `fetch` for ONE file, not for every build script.
    //
    // The model fetcher is the only place in this repository that may make a
    // network request, and it is build-time by definition (ARCHITECTURE.md
    // D46). Granting the global to `packages/*/scripts/**` would quietly
    // license every future script to reach the network in a project whose
    // first non-negotiable is that nothing does - so the exemption is scoped
    // to the check it excuses and no wider.
    files: ['packages/extension/scripts/fetch-model.mjs'],
    languageOptions: { globals: { fetch: 'readonly' } },
  },
  {
    // Build-time generator scripts run in Node and are never bundled, so the
    // environment-agnostic rules that govern packages/core do not apply.
    files: ['packages/*/scripts/**'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  {
    // Code that RUNS IN A BROWSER PAGE rather than in Node: the benchmark
    // harness, and the in-page half of the fixture capture tool. Neither is
    // bundled into the extension; both legitimately use DOM globals.
    files: ['bench/**/*.mjs', 'packages/extension/scripts/capture-fixture.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly', document: 'readonly', navigator: 'readonly',
        location: 'readonly', performance: 'readonly', Node: 'readonly',
        URLSearchParams: 'readonly', globalThis: 'readonly', process: 'readonly',
      },
    },
  },
  {
    // SPEC non-negotiable: "Never log or console-print a sensitive value, even
    // in debug builds." The extension handles composer text, so console output
    // from it is banned by default rather than left to reviewer vigilance.
    //
    // src/debug.ts is the single exception, and it is a narrow one: it prints
    // only what diagnostics.ts produces, which is structural by construction -
    // lengths, counts, tags, tiers and strategy ids, never page text. The
    // guarantee lives at the source of the data, not at the print site.
    files: ['packages/extension/src/**/*.ts'],
    ignores: ['packages/extension/src/debug.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // packages/core is an environment-agnostic library: it must run identically
    // in a browser extension, a web worker, and Node. No DOM, no Node built-ins.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core must stay DOM-free' },
        { name: 'document', message: 'core must stay DOM-free' },
        { name: 'navigator', message: 'core must stay DOM-free' },
        { name: 'localStorage', message: 'core must stay DOM-free' },
        { name: 'location', message: 'core must stay DOM-free' },
        { name: 'fetch', message: 'core must stay IO-free' },
        { name: 'XMLHttpRequest', message: 'core must stay IO-free' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['node:*'], message: 'core must not depend on Node built-ins' }],
        },
      ],
    },
  },
  prettierConfig,
);
