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
      '**/node_modules/**',
      '**/coverage/**',
      // Generated Unicode data (large; owned by the generator script).
      'packages/data/src/confusables.ts',
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
