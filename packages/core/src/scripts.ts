/**
 * Script detection using native Unicode property escapes (\p{Script=...}).
 * No external library.
 *
 * Characters are classified by CODE POINT (never by UTF-16 code unit), so
 * astral-plane characters — e.g. CJK Extension B ideographs — are handled
 * correctly.
 */
import type { ScriptInfo, ScriptName } from './types.js';

/**
 * Script membership tests, checked in this order. Kana merges Hiragana and
 * Katakana into one bucket because the pipeline treats Japanese syllabaries
 * as a unit.
 */
const SCRIPT_PATTERNS: ReadonlyArray<readonly [ScriptName, RegExp]> = [
  ['latin', /\p{Script=Latin}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['han', /\p{Script=Han}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['thai', /\p{Script=Thai}/u],
  ['armenian', /\p{Script=Armenian}/u],
  ['georgian', /\p{Script=Georgian}/u],
  ['ethiopic', /\p{Script=Ethiopic}/u],
];

const LETTER = /\p{L}/u;

/** All supported scripts, i.e. every ScriptName except 'other'. */
const REAL_SCRIPTS = SCRIPT_PATTERNS.map(([name]) => name);

/**
 * Classification of one code point:
 *  - 'neutral'   — not a letter (whitespace, digits, punctuation, symbols,
 *                  combining marks, controls). Ignored for dominance because
 *                  it would skew the result.
 *  - a ScriptName — a letter of that script ('other' for unsupported scripts).
 */
export type CodePointClass = ScriptName | 'neutral';

/**
 * Memo of code point → class. Script property lookups go through regexes,
 * which is too slow to repeat per character on large inputs; real-world text
 * has few distinct code points, so a memo makes classification ~O(1).
 * Capped so adversarial input (e.g. fuzzing across the whole Unicode range)
 * cannot grow it without bound.
 */
const classMemo = new Map<number, CodePointClass>();
const CLASS_MEMO_MAX = 0x10000;

/** Classify a single code point. Exported for use by the fold transform. */
export function classifyCodePoint(cp: number): CodePointClass {
  // ASCII fast path — the overwhelmingly common case.
  if (cp < 0x80) {
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return 'latin';
    return 'neutral';
  }
  const memoized = classMemo.get(cp);
  if (memoized !== undefined) return memoized;

  const char = String.fromCodePoint(cp);
  let result: CodePointClass = 'neutral';
  if (LETTER.test(char)) {
    result = 'other';
    for (const [name, pattern] of SCRIPT_PATTERNS) {
      if (pattern.test(char)) {
        result = name;
        break;
      }
    }
  }
  if (classMemo.size < CLASS_MEMO_MAX) classMemo.set(cp, result);
  return result;
}

/**
 * The ScriptName for a single character (the first code point of `char`).
 * Script-neutral characters and letters of unsupported scripts both report
 * 'other'.
 */
export function getCharScript(char: string): ScriptName {
  const cp = char.codePointAt(0);
  if (cp === undefined) return 'other';
  const cls = classifyCodePoint(cp);
  return cls === 'neutral' ? 'other' : cls;
}

function emptyCounts(): Record<ScriptName, number> {
  const counts = {} as Record<ScriptName, number>;
  for (const name of REAL_SCRIPTS) counts[name] = 0;
  counts.other = 0;
  return counts;
}

/**
 * Per-script letter counts, the dominant script, and whether the text mixes
 * scripts. Whitespace, digits, and punctuation are ignored — they are
 * script-neutral and would skew dominance.
 */
export function detectScripts(text: string): ScriptInfo {
  const counts = emptyCounts();
  // for..of iterates CODE POINTS, so surrogate pairs are never split.
  for (const char of text) {
    const cls = classifyCodePoint(char.codePointAt(0)!);
    if (cls === 'neutral') continue;
    counts[cls] += 1;
  }

  let dominant: ScriptName | null = null;
  let best = 0;
  let tied = false;
  let present = 0;
  for (const name of REAL_SCRIPTS) {
    const count = counts[name];
    if (count > 0) present += 1;
    if (count > best) {
      best = count;
      dominant = name;
      tied = false;
    } else if (count === best && count > 0) {
      tied = true;
    }
  }
  return {
    counts,
    // Dominance requires a strict maximum; a tie means "no dominant script".
    dominant: tied ? null : dominant,
    mixed: present > 1,
  };
}
