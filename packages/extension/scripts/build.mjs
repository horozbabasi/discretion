// Builds the loadable extension into packages/extension/build/.
//
// TWO vite passes rather than one, because MV3 requires two different module
// formats and a single rollup output cannot emit both:
//   - content scripts must be classic scripts; MV3 has no way to declare one
//     as a module, so it is bundled IIFE with everything inlined.
//   - the service worker is declared "type": "module" and is bundled ESM.
//
// Static files are copied afterwards. `dist/` belongs to `tsc -b` (declaration
// output); the loadable extension goes to `build/`, matching the convention
// packages/web already uses.
import { build } from 'vite';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');

/** Entry points, with the module format MV3 requires for each. */
const ENTRIES = [
  { file: 'src/content.ts', name: 'content', format: 'iife' },
  { file: 'src/service-worker.ts', name: 'service-worker', format: 'es' },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of ENTRIES) {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir: 'build',
      emptyOutDir: false,
      target: 'es2022',
      minify: false, // A reviewer must be able to read what ships. SPEC asks for a verifiable build.
      lib: {
        entry: join(ROOT, entry.file),
        formats: [entry.format],
        fileName: () => `${entry.name}.js`,
        name: entry.name.replace(/-/g, '_'),
      },
      rollupOptions: {
        // Nothing may be external: an MV3 package cannot fetch code at runtime.
        external: [],
      },
    },
  });
}

cpSync(join(ROOT, 'src', 'manifest.json'), join(OUT, 'manifest.json'));
cpSync(join(ROOT, 'src', 'icons'), join(OUT, 'icons'), {
  recursive: true,
  filter: (src) => statSync(src).isDirectory() || src.endsWith('.png'),
});

// Verify rather than assume. A build that silently emitted nothing is exactly
// the kind of thing that gets reported as done.
const required = ['manifest.json', 'content.js', 'service-worker.js', 'icons/icon128.png'];
const missing = required.filter((f) => {
  try {
    return statSync(join(OUT, f)).size === 0;
  } catch {
    return true;
  }
});
if (missing.length > 0) {
  console.error(`extension build FAILED: missing or empty ${missing.join(', ')}`);
  process.exit(1);
}

const listing = readdirSync(OUT, { recursive: true })
  .filter((f) => !statSync(join(OUT, f)).isDirectory())
  .map((f) => `  ${f} (${statSync(join(OUT, f)).size} bytes)`)
  .join('\n');
console.log(`extension build OK ->  ${OUT}\n${listing}`);
