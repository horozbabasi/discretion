// Bundles the live probe as a single IIFE for injection into a live page.
//
// Kept out of scripts/build.mjs on purpose: the probe imports adapter
// internals and must never end up inside the shipped package. It goes to a
// gitignored directory that the extension build does not read.
import { build } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.probe');

await build({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: '.probe',
    emptyOutDir: true,
    target: 'es2022',
    minify: false,
    lib: {
      entry: join(ROOT, 'src/devtools/liveProbe.ts'),
      formats: ['iife'],
      fileName: () => 'live-probe.js',
      name: 'DiscretionLiveProbe',
    },
    rollupOptions: { external: [] },
  },
});

const file = join(OUT, 'live-probe.js');
const size = statSync(file).size;
if (size === 0) {
  console.error('live probe build FAILED: empty output');
  process.exit(1);
}
console.log(`live probe built -> ${file} (${size} bytes)`);
