/**
 * Generator for packages/data/src/confusables.ts.
 *
 * Fetches the official Unicode security data (confusables.txt), parses it,
 * and emits a TypeScript data module. The generated module is COMMITTED so
 * neither the build nor the runtime ever needs network access; this script
 * exists to make the data reproducible and auditable.
 *
 * Run with:  npm run generate -w @privacyshield/data
 * (executes this file directly via Node's type stripping — Node 24+, see
 * .nvmrc — so paths below are relative to THIS source file's location).
 *
 * Post-processing applied to the raw data, in order:
 *   1. The mapped-to sequence ("skeleton") is NFKC-normalized. The folding
 *      transform runs after (and is followed by) NFKC in the Stage 0
 *      pipeline, so replacements must be NFKC-stable or normalization would
 *      not be idempotent.
 *   2. Entries whose skeleton equals the source character after step 1 are
 *      dropped — they would be no-op folds.
 *   3. Each entry is annotated with the script of its source character and
 *      of its skeleton, because selective folding needs to know what script
 *      it would be folding into. Script names mirror ScriptName in
 *      @privacyshield/core (kept in sync by convention; the unions are
 *      structurally identical).
 *
 * REPRODUCIBILITY: the emitted module records the Unicode version AND the
 * SHA-256 of the exact source bytes this run consumed. Unicode publishes the
 * security data under numbered directories only after the fact — at the time
 * of writing, 17.0.0 is served from `latest/` while the newest numbered
 * directory is 16.0.0 — so there is no stable versioned URL to pin to. The
 * digest is the pin: re-running the generator and diffing the recorded hash
 * tells you whether upstream changed under you. Set CONFUSABLES_URL to
 * override the source (e.g. a numbered directory once one exists, or a local
 * copy for offline regeneration).
 *
 * ATTRIBUTION: the Unicode License v3 requires its copyright and permission
 * notice to accompany copies of the data or appear in associated
 * documentation. The full notice lives in THIRD_PARTY_NOTICES.md at the repo
 * root, and the generated module's header points at it.
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCE_URL =
  process.env.CONFUSABLES_URL ?? 'https://www.unicode.org/Public/security/latest/confusables.txt';
const OUTPUT_URL = new URL('../src/confusables.ts', import.meta.url);

type ScriptName =
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'devanagari'
  | 'greek'
  | 'thai'
  | 'armenian'
  | 'georgian'
  | 'ethiopic'
  | 'other';

const SCRIPT_PATTERNS: ReadonlyArray<readonly [ScriptName, RegExp]> = [
  ['latin', /\p{Script=Latin}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  // Script_Extensions (not Script) for Han/Kana — matches the runtime
  // classifier in @privacyshield/core: shared CJK letters like U+30FC and
  // U+3005 are Script=Common but belong to these scripts in practice.
  ['han', /\p{Script_Extensions=Han}/u],
  ['kana', /[\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
  ['armenian', /\p{Script=Armenian}/u],
  ['georgian', /\p{Script=Georgian}/u],
  ['ethiopic', /\p{Script=Ethiopic}/u],
];
const LETTER = /\p{L}/u;

function scriptOfChar(char: string): ScriptName {
  if (!LETTER.test(char)) return 'other';
  for (const [name, pattern] of SCRIPT_PATTERNS) {
    if (pattern.test(char)) return name;
  }
  return 'other';
}

/**
 * Script of a (possibly multi-character) skeleton: the single script of its
 * letters, or 'other' when it has no letters or mixes scripts.
 */
function scriptOfString(s: string): ScriptName {
  let found: ScriptName | null = null;
  for (const char of s) {
    const script = scriptOfChar(char);
    if (script === 'other') {
      if (LETTER.test(char)) return 'other'; // letter of an unsupported script
      continue; // marks/digits don't decide the script
    }
    if (found === null) found = script;
    else if (found !== script) return 'other';
  }
  return found ?? 'other';
}

/** Escape a string as a TS single-quoted literal, unicode-escaping non-ASCII. */
function tsLiteral(s: string): string {
  let out = "'";
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    const char = s[i]!;
    if (char === "'" || char === '\\') out += '\\' + char;
    else if (unit >= 0x20 && unit <= 0x7e) out += char;
    else out += '\\u' + unit.toString(16).padStart(4, '0');
  }
  return out + "'";
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Fetching ${SOURCE_URL} failed: HTTP ${response.status}`);
}
const rawText = await response.text();

// Digest the exact bytes consumed — this is the reproducibility pin (see header).
const sourceSha256 = createHash('sha256').update(rawText, 'utf8').digest('hex');

const version = rawText.match(/^#\s*Version:\s*(\S+)/m)?.[1] ?? 'unknown';
const dateLine = rawText.match(/^#\s*Date:\s*(.+)$/m)?.[1]?.trim() ?? 'unknown';

const LINE = /^([0-9A-Fa-f]{4,6})\s*;\s*((?:[0-9A-Fa-f]{4,6}\s*)+);/;

interface Entry {
  cp: number;
  sourceScript: ScriptName;
  skeleton: string;
  skeletonScript: ScriptName;
}

const entries: Entry[] = [];
let parsed = 0;
let droppedIdentity = 0;
let droppedEmpty = 0;
let skippedLines = 0;

for (const line of rawText.split(/\r?\n/)) {
  // Strip a leading BOM (U+FEFF) — the file starts with one.
  const trimmed = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line;
  if (trimmed === '' || trimmed.startsWith('#')) continue;
  const match = LINE.exec(trimmed);
  if (!match) {
    skippedLines++;
    continue;
  }
  parsed++;
  const cp = parseInt(match[1]!, 16);
  const targets = match[2]!
    .trim()
    .split(/\s+/)
    .map((hex) => parseInt(hex, 16));
  const skeleton = String.fromCodePoint(...targets).normalize('NFKC');
  if (skeleton.length === 0) {
    droppedEmpty++;
    continue;
  }
  const sourceChar = String.fromCodePoint(cp);
  if (skeleton === sourceChar) {
    droppedIdentity++;
    continue;
  }
  entries.push({
    cp,
    sourceScript: scriptOfChar(sourceChar),
    skeleton,
    skeletonScript: scriptOfString(skeleton),
  });
}

if (entries.length < 1000) {
  throw new Error(
    `Parsed only ${entries.length} entries — that cannot be the full confusables table. Aborting without writing.`,
  );
}

entries.sort((a, b) => a.cp - b.cp);

const lines: string[] = [];
lines.push('/**');
lines.push(' * AUTO-GENERATED — DO NOT EDIT BY HAND.');
lines.push(' *');
lines.push(' * Unicode confusables table (single-character sources → skeletons),');
lines.push(` * generated from the official Unicode security data by`);
lines.push(' * packages/data/scripts/build-confusables.ts.');
lines.push(' *');
lines.push(` * Source:          ${SOURCE_URL}`);
lines.push(` * Unicode version: ${version}`);
lines.push(` * Source dated:    ${dateLine}`);
lines.push(` * Source SHA-256:  ${sourceSha256}`);
lines.push(` * Generated:       ${new Date().toISOString()}`);
lines.push(` * Entries:         ${entries.length}`);
lines.push(` *   (from ${parsed} data lines; dropped ${droppedIdentity} identity mappings`);
lines.push(` *   after NFKC-normalizing skeletons, ${droppedEmpty} empty skeletons;`);
lines.push(` *   ${skippedLines} non-matching lines skipped)`);
lines.push(' *');
lines.push(' * Format: [source code point, source script, skeleton (NFKC), skeleton script].');
lines.push(' * Script names mirror ScriptName in @privacyshield/core.');
lines.push(' *');
lines.push(' * ── ATTRIBUTION ──────────────────────────────────────────────────────');
lines.push(' * Derived from Unicode Character Database security data.');
lines.push(' * Copyright © 1991-2026 Unicode, Inc. Distributed under the Unicode');
lines.push(' * License v3 / Terms of Use: https://www.unicode.org/copyright.html');
lines.push(' * The full copyright and permission notice this license requires is');
lines.push(' * reproduced in THIRD_PARTY_NOTICES.md at the repository root.');
lines.push(' */');
lines.push('');
lines.push('export type ScriptName =');
lines.push("  | 'latin'");
lines.push("  | 'cyrillic'");
lines.push("  | 'arabic'");
lines.push("  | 'hebrew'");
lines.push("  | 'han'");
lines.push("  | 'kana'");
lines.push("  | 'hangul'");
lines.push("  | 'devanagari'");
lines.push("  | 'greek'");
lines.push("  | 'thai'");
lines.push("  | 'armenian'");
lines.push("  | 'georgian'");
lines.push("  | 'ethiopic'");
lines.push("  | 'other';");
lines.push('');
lines.push(`export const CONFUSABLES_UNICODE_VERSION = ${tsLiteral(version)};`);
lines.push(`export const CONFUSABLES_SOURCE_URL = ${tsLiteral(SOURCE_URL)};`);
lines.push('/** SHA-256 of the exact source bytes this table was generated from. */');
lines.push(`export const CONFUSABLES_SOURCE_SHA256 = ${tsLiteral(sourceSha256)};`);
lines.push('');
lines.push('export const CONFUSABLES_RAW: ReadonlyArray<');
lines.push('  readonly [number, ScriptName, string, ScriptName]');
lines.push('> = [');
for (const e of entries) {
  const hex = '0x' + e.cp.toString(16).padStart(4, '0');
  lines.push(`  [${hex}, '${e.sourceScript}', ${tsLiteral(e.skeleton)}, '${e.skeletonScript}'],`);
}
lines.push('];');
lines.push('');

writeFileSync(OUTPUT_URL, lines.join('\n'));
console.log(`Wrote ${entries.length} entries (Unicode ${version}) to ${OUTPUT_URL.pathname}`);
