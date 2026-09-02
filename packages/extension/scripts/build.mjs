// Builds the loadable extension into packages/extension/build/.
//
// THREE vite passes rather than one, because MV3 wants different module
// formats in different places and a single rollup output cannot emit them all:
//   - content scripts must be classic scripts; MV3 has no way to declare one
//     as a module, so it is bundled IIFE with everything inlined.
//   - the service worker is declared "type": "module" and is bundled ESM.
//   - the offscreen document is an extension PAGE loading a module script, so
//     it is ESM too. It is a separate pass rather than a second entry in the
//     worker's build because nothing may be shared between them: the worker
//     must not link the model runtime, and the offscreen document has no use
//     for the worker's chrome.offscreen calls.
//
// Static files are copied afterwards. `dist/` belongs to `tsc -b` (declaration
// output); the loadable extension goes to `build/`, matching the convention
// packages/web already uses.
import { build } from 'vite';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');
const OUT = join(ROOT, 'build');

/**
 * `--bench` also emits the IPC latency harness and widens the content-script
 * match to localhost so it can be driven.
 *
 * A DEVIATION FROM WHAT SHIPS, and a deliberately small one: nothing else
 * changes. Same content script, same port, same protocol, same offscreen
 * document. The shipped manifest never references bench.js, and a normal build
 * does not emit it.
 */
const BENCH = process.argv.includes('--bench');

/** Entry points, with the module format MV3 requires for each. */
const ENTRIES = [
  { file: 'src/content.ts', name: 'content', format: 'iife' },
  { file: 'src/service-worker.ts', name: 'service-worker', format: 'es' },
  { file: 'src/offscreen/offscreen.ts', name: 'offscreen', format: 'es' },
  // The popup is an extension PAGE loading a module script, like the offscreen
  // document. Separate from the content script because nothing is shared: the
  // popup has no page to inject into, and the content script has no popup.
  { file: 'src/popup/popup.ts', name: 'popup', format: 'es' },
  ...(BENCH ? [{ file: 'src/bench/ipcBench.ts', name: 'bench', format: 'iife' }] : []),
];

// The model, and where it must land. `env.localModelPath` is joined with the
// model id, so the on-disk layout has to be models/<repo>/<name>/ exactly.
const MODEL_ID = 'jiting/xlm-roberta-base-ner-hrl_onnx';
const MODEL_CACHE = join(REPO, '.hf-cache', MODEL_ID);
const MODEL_OUT = join(OUT, 'models', MODEL_ID);
// Only the files the runtime reads. The cache also holds fp32 weights, and the
// repo holds fp16 for other candidates - fp32 measured no better and fp16 does
// not run on the WASM provider at all (BENCHMARKS.md M6). Shipping either
// would add a gigabyte to the package for nothing.
const MODEL_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];
const MODEL_WEIGHTS = 'onnx/model_quantized.onnx';

// onnxruntime-web's WASM binaries. Bundled rather than fetched: SPEC's first
// non-negotiable is zero runtime network access, and left to itself the
// runtime resolves these from a CDN.
const ORT_DIST = join(REPO, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_OUT = join(OUT, 'ort');
//
// EVERY ort-wasm-* variant, not a chosen subset. Which one the runtime loads is
// decided at run time by feature detection - threads, SIMD, JSPI, asyncify -
// and it differs by browser and by machine. A hand-picked list was tried and
// failed on the first real run: the runtime asked for
// `ort-wasm-simd-threaded.asyncify.mjs`, which was not in it, and the whole of
// Stage 2 failed with "no available backend found".
//
// Guessing which variant a user's browser will want is the kind of assumption
// that fails only on hardware nobody tested. The four together are ~77 MB
// beside a 278 MB model, which is the cheaper mistake.
const ORT_FILES = readdirSync(ORT_DIST).filter((f) => f.startsWith('ort-wasm-'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of ENTRIES) {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    resolve: {
      // onnxruntime-web ships two variants behind an export condition. The
      // DEFAULT one embeds its .wasm binaries as base64 data: URIs - 62 MB of
      // JavaScript in a 68 MB bundle, which the offscreen document then has to
      // parse before the model can even start loading. The
      // `onnxruntime-web-use-extern-wasm` condition selects the variant that
      // loads them as files, which is what `env.backends.onnx.wasm.wasmPaths`
      // already points at. The embedded copies were never reachable.
      //
      // The default conditions are restated because vite REPLACES the list
      // rather than extending it, and dropping 'import'/'module' silently
      // resolves half the dependency tree to its CommonJS build.
      conditions: ['onnxruntime-web-use-extern-wasm', 'module', 'browser', 'import', 'default'],
    },
    build: {
      outDir: 'build',
      emptyOutDir: false,
      target: 'es2022',
      minify: false, // A reviewer must be able to read what ships. SPEC asks for a verifiable build.
      // NEVER inline an asset as a data: URI. onnxruntime-web references its
      // .wasm binaries through `new URL(...)`, and at vite's default 4 KB
      // threshold... it inlined them anyway, as two 31 MB base64 literals -
      // 62 MB of JavaScript that the browser must parse, sitting beside the
      // very same bytes already copied to ort/ as files. `wasmPaths` points at
      // that copy, so the inlined pair was never even reachable.
      assetsInlineLimit: 0,
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

// ── _locales/, generated from the typed catalogues ──
//
// Built through vite from src/ rather than imported from dist/, because
// `npm run ext:build` does not run `tsc -b` and a stale dist/ would ship last
// week's translations without saying so.
const LOCALES_TMP = join(OUT, '.locales.tmp.mjs');
await build({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    lib: {
      entry: join(ROOT, 'src', 'i18n', 'locales', 'index.ts'),
      formats: ['es'],
      fileName: () => '.locales.tmp.mjs',
    },
    rollupOptions: { external: [] },
  },
});
const { LOCALES, toMessages } = await import(pathToFileURL(LOCALES_TMP).href);
rmSync(LOCALES_TMP, { force: true });

// The flattening itself lives in src/i18n/toMessages.ts, where it is
// typechecked and unit-tested. All that belongs here is the file writing.
const localesRoot = join(OUT, '_locales');
rmSync(localesRoot, { recursive: true, force: true });
const localesWritten = LOCALES.map((locale) => {
  const messages = toMessages(locale.catalogue, locale.entities);
  const dir = join(localesRoot, locale.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'messages.json'), `${JSON.stringify(messages, null, 2)}
`, 'utf8');
  return { dir: locale.dir, keys: Object.keys(messages).length };
});

const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'manifest.json'), 'utf8'));
// The store listing is localised through the same catalogues as the UI. Chrome
// resolves __MSG_…__ in the manifest against _locales/<default_locale>/.
manifest.default_locale = 'en';
manifest.name = '__MSG_appName__';
manifest.description = '__MSG_appDescription__';
manifest.action.default_title = '__MSG_appName__';
if (BENCH) {
  manifest.content_scripts.push({
    matches: ['http://localhost/*'],
    js: ['bench.js'],
    run_at: 'document_idle',
  });
  manifest.host_permissions = [...manifest.host_permissions, 'http://localhost/*'];
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}
`);
cpSync(join(ROOT, 'src', 'offscreen', 'offscreen.html'), join(OUT, 'offscreen.html'));
cpSync(join(ROOT, 'src', 'popup', 'popup.html'), join(OUT, 'popup.html'));
cpSync(join(ROOT, 'src', 'popup', 'popup.css'), join(OUT, 'popup.css'));
cpSync(join(ROOT, 'src', 'icons'), join(OUT, 'icons'), {
  recursive: true,
  filter: (src) => statSync(src).isDirectory() || src.endsWith('.png'),
});

// ── model + runtime assets ──
const missingAssets = [];
if (existsSync(MODEL_CACHE)) {
  mkdirSync(join(MODEL_OUT, 'onnx'), { recursive: true });
  for (const file of MODEL_FILES) {
    const from = join(MODEL_CACHE, file);
    if (existsSync(from)) cpSync(from, join(MODEL_OUT, file));
    else missingAssets.push(`model:${file}`);
  }
  const weights = join(MODEL_CACHE, MODEL_WEIGHTS);
  if (existsSync(weights)) cpSync(weights, join(MODEL_OUT, MODEL_WEIGHTS));
  else missingAssets.push(`model:${MODEL_WEIGHTS}`);
} else {
  missingAssets.push(`model cache absent: ${MODEL_CACHE}`);
}

mkdirSync(ORT_OUT, { recursive: true });
for (const file of ORT_FILES) {
  const from = join(ORT_DIST, file);
  if (existsSync(from)) cpSync(from, join(ORT_OUT, file));
  else missingAssets.push(`ort:${file}`);
}

// Verify rather than assume. A build that silently emitted nothing is exactly
// the kind of thing that gets reported as done.
const required = [
  'manifest.json',
  'content.js',
  'service-worker.js',
  'offscreen.js',
  'offscreen.html',
  'icons/icon128.png',
  'popup.html',
  'popup.css',
  'popup.js',
  '_locales/en/messages.json',
  '_locales/ar/messages.json',
];
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

// ── the content script must NOT contain the gazetteers ──
//
// Stage 2b moved to the offscreen document because the gazetteers only ever
// corroborate types the model produces. That is a claim about what LINKS, and
// a claim about linking is worth exactly as much as the check that enforces
// it: one careless import in Stage 3 would quietly put 3.4 MB of base64 back
// into a script parsed on every page load of all three sites, and no test
// would notice.
const contentSource = readFileSync(join(OUT, 'content.js'), 'utf8');
const bigLiterals = [...contentSource.matchAll(/"[A-Za-z0-9+/=]{100000,}"/g)];
if (bigLiterals.length > 0) {
  const chars = bigLiterals.reduce((n, m) => n + m[0].length, 0);
  console.error(
    `extension build FAILED: content.js contains ${bigLiterals.length} very large base64 ` +
      `literal(s) totalling ${chars.toLocaleString()} chars. The gazetteers belong with Stage 2, ` +
      `in the offscreen document — see packages/core/src/ner/stage2b.ts.`,
  );
  process.exit(1);
}

// ── the content script must NOT contain the translated catalogues ──
//
// At run time chrome.i18n hands back the one locale the browser is set to, so
// content.js carries English as its floor and nothing else. src/i18n/locales/
// says so in a comment; this is what makes it true. One careless import would
// link all nine languages into a script parsed on every page load of all three
// sites, to make eight of them unreachable.
//
// The sentinel is read from each catalogue rather than hardcoded here, so it
// cannot drift out of step with the translation it is checking for.
const leaked = LOCALES.filter((l) => l.dir !== 'en').filter((l) =>
  contentSource.includes(l.catalogue['panel.action.maskAndSend']),
);
if (leaked.length > 0) {
  console.error(
    `extension build FAILED: content.js contains the ${leaked
      .map((l) => l.dir)
      .join(', ')} catalogue(s). Translations reach the page through chrome.i18n; ` +
      'nothing reachable from src/content.ts may import src/i18n/locales/.',
  );
  process.exit(1);
}

const listing = readdirSync(OUT, { recursive: true })
  .filter((f) => !statSync(join(OUT, f)).isDirectory())
  .map((f) => ({ f, size: statSync(join(OUT, f)).size }))
  .sort((a, b) => b.size - a.size);
const total = listing.reduce((n, e) => n + e.size, 0);

console.log(`extension build OK ->  ${OUT}`);
console.log(
  `  _locales: ${localesWritten.map((l) => `${l.dir} (${l.keys} keys)`).join(', ')}`,
);
for (const { f, size } of listing.slice(0, 12)) {
  console.log(`  ${f} (${size.toLocaleString()} bytes)`);
}
if (listing.length > 12) console.log(`  ... and ${listing.length - 12} more`);
console.log(`  TOTAL ${total.toLocaleString()} bytes across ${listing.length} files`);
if (missingAssets.length > 0) {
  console.warn(
    `\nWARNING: ${missingAssets.length} asset(s) were not bundled:\n  ${missingAssets.join('\n  ')}\n` +
      'The extension will load, but Stage 2 will fail closed at runtime.\n' +
      // Naming the fix, not just the problem. The model is ~280 MB and is not
      // in the repository, so a fresh clone lands here and had no documented
      // way out - which is a hard blocker for M11's "production build verified
      // loading unpacked in Chrome".
      'Run: npm run ext:fetch-model',
  );
}
