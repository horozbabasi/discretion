/**
 * Transform 3: SELECTIVE HOMOGLYPH FOLDING.
 *
 * THE RULE — and why it is selective:
 * Blanket folding would be a severe bug: folding every Cyrillic а to Latin a
 * would turn an entire Russian document into unreadable Latin nonsense and
 * destroy detection for every non-Latin user. A character is folded ONLY when
 * it is script-anomalous within its own token:
 *
 *   1. Split the text into tokens on whitespace and punctuation.
 *   2. Determine each token's dominant script (strict majority of its
 *      letters; neutral characters don't count).
 *   3. Fold a character only if its script differs from the token's dominant
 *      script AND the confusables table gives it a mapping into that script.
 *
 * A token that is wholly Cyrillic / Greek / Arabic / … has no anomalous
 * characters and is left completely untouched.
 *
 *   • "pаssword" (Cyrillic а in a Latin token) → folds to "password".
 *   • "пароль"   (ordinary Cyrillic word)      → byte-identical.
 *
 * Mapping INTO the dominant script works in both directions:
 *   - directly: the character's Unicode skeleton is in the dominant script
 *     (Cyrillic а → skeleton "a", Latin) — replace with the skeleton;
 *   - via equivalence: some character OF the dominant script shares the same
 *     skeleton (Latin o inside a Greek token → Greek ο, whose skeleton is
 *     also "o") — replace with that character.
 *
 * Replacements are restricted to letters/marks/digits: a replacement that
 * introduced punctuation or whitespace would change tokenization on a second
 * pass and break idempotency.
 *
 * This transform runs AFTER NFKC, so the confusables data's skeletons are
 * NFKC-normalized at generation time; normalize() additionally re-runs NFKC
 * after folding (see normalization.ts) so a folded character can compose
 * with a following combining mark exactly as it would have in pass one.
 */
import { CONFUSABLES, type ConfusableEntry } from '@discretion/data';
import { classifyCodePoint, scriptsCompatible } from '../scripts.js';
import type { ScriptName } from '../types.js';
import { MappedTextBuilder, type TransformStepResult, type StepChange } from '../offsetMap.js';

/** Tokens are maximal runs of characters that are neither whitespace nor punctuation. */
const TOKEN = /[^\s\p{P}]+/gu;

/** Replacements may only contain letters, combining marks, and digits. */
const SAFE_REPLACEMENT = /^[\p{L}\p{M}\p{N}]+$/u;

/**
 * skeleton → script → representative character of that script sharing the
 * skeleton. Built lazily on first use from the confusables table (plus each
 * skeleton itself as the representative of its own script). Where several
 * characters of one script share a skeleton, the lowest code point wins so
 * regeneration of the data cannot reorder results.
 */
let skeletonIndex: Map<string, Map<ScriptName, string>> | null = null;

function getSkeletonIndex(): Map<string, Map<ScriptName, string>> {
  if (skeletonIndex) return skeletonIndex;
  const index = new Map<string, Map<ScriptName, string>>();
  const consider = (skeleton: string, script: ScriptName, repr: string): void => {
    if (script === 'other') return;
    // A representative becomes replacement text, so it must survive the rest
    // of the pipeline unchanged: NFKC-stable (U+037A GREEK YPOGEGRAMMENI, for
    // instance, decomposes to space + combining mark and would smuggle
    // whitespace into a token) and free of punctuation/whitespace that would
    // change tokenization on a second pass.
    if (repr.normalize('NFKC') !== repr) return;
    if (!SAFE_REPLACEMENT.test(repr)) return;
    let byScript = index.get(skeleton);
    if (!byScript) {
      byScript = new Map<ScriptName, string>();
      index.set(skeleton, byScript);
    }
    const existing = byScript.get(script);
    if (existing === undefined || repr.codePointAt(0)! < existing.codePointAt(0)!) {
      byScript.set(script, repr);
    }
  };
  for (const [cp, entry] of CONFUSABLES) {
    // The confusable character itself represents its script for this skeleton…
    consider(entry.skeleton, entry.sourceScript, String.fromCodePoint(cp));
    // …and the skeleton represents its own script (preferred when reachable:
    // for single-char skeletons it is usually the lowest code point anyway).
    consider(entry.skeleton, entry.skeletonScript, entry.skeleton);
  }
  skeletonIndex = index;
  return index;
}

/** Test hook: drop the memoized index (e.g. around mocked data). */
export function resetSkeletonIndexForTests(): void {
  skeletonIndex = null;
}

/**
 * The replacement for folding `cp` into `dominant`, or null when the
 * confusables table offers no mapping into that script.
 */
function foldTarget(cp: number, dominant: ScriptName): string | null {
  const entry: ConfusableEntry | undefined = CONFUSABLES.get(cp);
  // A character absent from the table is its own skeleton: it can still be
  // the skeleton OF characters in the dominant script — e.g. Latin 'o' has
  // no entry, but inside a Greek token it folds to Greek omicron, whose
  // skeleton is 'o' (the equivalence direction).
  const skeleton = entry ? entry.skeleton : String.fromCodePoint(cp);
  let replacement: string | undefined;
  if (entry && entry.skeletonScript === dominant) {
    replacement = entry.skeleton;
  } else {
    replacement = getSkeletonIndex().get(skeleton)?.get(dominant);
  }
  if (replacement === undefined) return null;
  if (replacement === String.fromCodePoint(cp)) return null; // no-op
  // Defense in depth (the index already filters its representatives, and
  // generated skeletons are NFKC-normalized): a replacement must not change
  // tokenization or decay under the NFKC re-pass, or folding would not be
  // idempotent.
  if (!SAFE_REPLACEMENT.test(replacement)) return null;
  if (replacement.normalize('NFKC') !== replacement) return null;
  return replacement;
}

interface Fold {
  /** Offset of the character within the token. */
  offset: number;
  /** Length of the character in code units. */
  length: number;
  before: string;
  after: string;
}

const ZWNJ = String.fromCharCode(0x200c);

/** Compute the folds for one token; empty when the token is not mixed-script. */
function computeFolds(token: string): Fold[] {
  // A ZWNJ surviving the strip stage marks joining-script morphology
  // (Persian, Hindi, …). Folding inside such a token could change the script
  // of a ZWNJ neighbor and flip the preservation decision on the next pass —
  // so these tokens are never folding candidates.
  if (token.includes(ZWNJ)) return [];

  // First pass: per-script letter counts to find the token's dominant script.
  const counts = new Map<ScriptName, number>();
  for (const char of token) {
    const cls = classifyCodePoint(char.codePointAt(0)!);
    if (cls === 'neutral' || cls === 'other') continue;
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  let dominant: ScriptName | null = null;
  let best = 0;
  let tied = false;
  for (const [script, count] of counts) {
    if (count > best) {
      best = count;
      dominant = script;
      tied = false;
    } else if (count === best) {
      tied = true;
    }
  }
  // No dominant script (all-neutral, unsupported-script, or tied token):
  // be conservative and leave the token alone. The tie rule is ratified —
  // an evenly split token gives no evidence of which script is "home".
  if (dominant === null || tied) return [];

  // Second pass: fold script-anomalous characters that can map into `dominant`.
  const folds: Fold[] = [];
  let offset = 0;
  for (const char of token) {
    const cp = char.codePointAt(0)!;
    const cls = classifyCodePoint(cp);
    // Neutral characters (digits, marks) are never anomalous. Letters of the
    // dominant script — or of a script COMPATIBLE with it (Han/Kana/Latin in
    // Japanese text, Hangul/Han in Korean; see scriptsCompatible) — are at
    // home. Everything else, including letters of unsupported scripts like
    // Cherokee (classified 'other'), is anomalous and folds if mappable.
    if (cls !== 'neutral' && !scriptsCompatible(cls, dominant)) {
      const after = foldTarget(cp, dominant);
      if (after !== null) {
        folds.push({ offset, length: char.length, before: char, after });
      }
    }
    offset += char.length;
  }
  return folds;
}

export function foldHomoglyphs(text: string): TransformStepResult | null {
  const builder = new MappedTextBuilder();
  const changes: StepChange[] = [];
  let cursor = 0;

  TOKEN.lastIndex = 0;
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0];
    const tokenStart = match.index!;
    const folds = computeFolds(token);
    if (folds.length === 0) continue;
    // Copy everything between the previous fold and this token, then splice
    // the folds in at their exact offsets.
    for (const fold of folds) {
      const foldStart = tokenStart + fold.offset;
      builder.copyVerbatim(text, cursor, foldStart);
      builder.replaceRange(fold.after, foldStart, foldStart + fold.length);
      changes.push({
        kind: 'homoglyph-fold',
        start: foldStart,
        end: foldStart + fold.length,
        before: fold.before,
        after: fold.after,
      });
      cursor = foldStart + fold.length;
    }
  }
  if (changes.length === 0) return null;

  builder.copyVerbatim(text, cursor, text.length);
  const { text: out, map } = builder.finish(text.length);
  return { text: out, map, changes };
}
