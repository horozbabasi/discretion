/**
 * Fetch the NER model a build needs, into the gitignored cache.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The model is ~280 MB and is not in the repository. `build.mjs` fails loudly
 * listing what is missing, which is the right failure - but until now there
 * was no documented way to satisfy it, so a fresh clone could not build the
 * extension at all. That is a hard blocker for M11's "production build
 * verified loading unpacked in Chrome", and it is much cheaper to fix now than
 * to rediscover then.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS DOES NOT WEAKEN THE ZERO-NETWORK CLAIM
 *
 * SPEC's first non-negotiable is "zero RUNTIME network access": no outbound
 * request after install, everything bundled at build time. This is the
 * build-time step that does the bundling. It runs on a developer's machine,
 * never in the extension, and nothing it writes is reachable at runtime except
 * as bytes already inside the package. `packages/core`'s own classifier makes
 * the same distinction - `allowRemoteModels` is documented "build-time tooling
 * ONLY".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT MAKES IT SAFE TO RUN
 *
 * The revision is a PINNED COMMIT on a content-addressed repository, so the
 * URL cannot quietly start serving different weights. But the pin is not what
 * is actually checked: every file is verified against a SHA-256 recorded in
 * `model.manifest.json`, and those digests were computed from the cache the M6
 * model benchmark and every latency figure since were measured against. So the
 * check is not "did we get what the repo serves today" but "did we get the
 * bytes this project's published numbers describe".
 *
 * A mismatch DELETES the downloaded file and exits non-zero. Leaving it would
 * mean the next build silently packages unverified weights, and a partial
 * download is exactly what that looks like.
 *
 * Run:  node packages/extension/scripts/fetch-model.mjs
 *       node packages/extension/scripts/fetch-model.mjs --write-manifest
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const MANIFEST = join(HERE, 'model.manifest.json');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const CACHE = join(REPO, '.hf-cache', manifest.modelId);
const WRITE_MANIFEST = process.argv.includes('--write-manifest');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function present(path, expected) {
  try {
    if (statSync(path).size !== expected.bytes) return false;
  } catch {
    return false;
  }
  return sha256(path) === expected.sha256;
}

async function download(file) {
  const url = `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${file}`;
  const target = join(CACHE, file);
  mkdirSync(dirname(target), { recursive: true });

  process.stdout.write(`  ${file} ... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)} for ${url}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

if (WRITE_MANIFEST) {
  // Regenerate from whatever is in the cache. Deliberately separate from the
  // fetch path: a mode that both downloaded AND rewrote the digests it checks
  // against could only ever agree with itself.
  const files = {};
  for (const file of Object.keys(manifest.files)) {
    const path = join(CACHE, file);
    files[file] = { bytes: statSync(path).size, sha256: sha256(path) };
    console.log(`  ${file}  ${String(files[file].bytes)}  ${files[file].sha256}`);
  }
  writeFileSync(MANIFEST, `${JSON.stringify({ ...manifest, files }, null, 2)}\n`, 'utf8');
  console.log(`\nwrote ${MANIFEST}`);
  process.exit(0);
}

console.log(`model   ${manifest.modelId}`);
console.log(`pinned  ${manifest.revision}`);
console.log(`into    ${CACHE}\n`);

let fetched = 0;
let verified = 0;
for (const [file, expected] of Object.entries(manifest.files)) {
  const target = join(CACHE, file);
  if (present(target, expected)) {
    console.log(`  ${file} ... already present and verified`);
    verified += 1;
    continue;
  }

  let path;
  try {
    path = await download(file);
  } catch (error) {
    console.error(`\nFAILED downloading ${file}: ${error.message}`);
    process.exit(1);
  }

  const got = sha256(path);
  if (got !== expected.sha256) {
    rmSync(path, { force: true });
    console.error(
      `\nDIGEST MISMATCH for ${file}\n` +
        `  expected ${expected.sha256}\n` +
        `  got      ${got}\n` +
        'The downloaded file has been deleted. The build must not package bytes\n' +
        "this project's published measurements do not describe.",
    );
    process.exit(1);
  }
  console.log('ok');
  fetched += 1;
}

console.log(`\n${String(fetched)} fetched, ${String(verified)} already verified.`);
console.log('Now run: npm run ext:build');
