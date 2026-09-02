/**
 * Properties of the source tree itself.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: A NUL BYTE HAS NOW GOT INTO THIS REPOSITORY TWICE.
 *
 * The first was caught by a pre-publication audit. The second landed inside a
 * comment in `storage/settings.ts` and survived `tsc`, `eslint`, 1,245 tests
 * and a production build — TypeScript treats it as whitespace inside a
 * comment, so nothing in the toolchain has an opinion about it. It was found
 * only because `grep` refused to search the file, reporting it as binary.
 *
 * A defect that every automated check tolerates and that makes standard tools
 * silently skip the file is exactly the kind worth a test of its own. It costs
 * one directory walk.
 *
 * The other checks here are the same shape: cheap, whole-tree, and about
 * things that do not show up as a failure anywhere else.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '.hf-cache', 'coverage']);
const SOURCE_EXTENSIONS = ['.ts', '.mjs', '.js', '.css', '.html', '.json', '.md'];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) out.push(path);
  }
  return out;
}

const FILES = sourceFiles(REPO);

/** Repo-relative, so a failure message is something you can click. */
function relative(path: string): string {
  return path.slice(REPO.length).replace(/\\/gu, '/');
}

describe('the source tree', () => {
  it('found files to check, so the sweep is not passing vacuously', () => {
    // Without this, a wrong REPO path or an over-eager skip list would make
    // every assertion below pass over an empty array.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('contains no NUL bytes', () => {
    const offenders: string[] = [];
    for (const path of FILES) {
      const bytes = readFileSync(path);
      const at = bytes.indexOf(0);
      if (at !== -1) offenders.push(`${relative(path)} (byte ${String(at)})`);
    }
    expect(offenders, `NUL bytes make grep treat a file as binary`).toEqual([]);
  });

  // A CRLF check was written here and then REMOVED, which is worth recording
  // rather than silently dropping. It flagged five files, and every one of
  // them is stored in git as LF: `.gitattributes` pins `* text=auto eol=lf`,
  // so line endings are normalised on commit and only the WORKING TREE differs
  // on Windows. The check was therefore testing the checkout rather than the
  // source, and would have failed for every Windows contributor over a
  // condition git already prevents.
  //
  // NUL bytes are the opposite case — git stores them verbatim whatever the
  // eol settings are — which is why that check stays.

  it('never parses a string as markup', () => {
    // SPEC.md, security of the extension itself: "No innerHTML with any
    // untrusted content; construct nodes programmatically." SECURITY.md tells
    // a reader to check this with grep; this is the same check, run on every
    // commit, so the claim cannot quietly stop being true.
    const forbidden = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(/u;
    const offenders: string[] = [];
    for (const path of FILES) {
      if (!path.endsWith('.ts')) continue;
      if (!path.includes(`${join('packages')}`) || !path.includes('src')) continue;
      for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
        // Comments explaining why it is not used are the only mentions.
        const code = line.replace(/^\s*(\*|\/\/).*$/u, '');
        if (forbidden.test(code)) offenders.push(`${relative(path)}:${String(index + 1)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
