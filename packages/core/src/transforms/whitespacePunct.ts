/**
 * Transform 4: WHITESPACE AND PUNCTUATION NORMALIZATION.
 *
 *   • exotic space characters → U+0020 regular space
 *   • dash variants (hyphen, non-breaking hyphen, figure/en/em dash,
 *     horizontal bar, minus sign) → '-' hyphen-minus
 *   • curly and angle quotes → straight ' and "
 *
 * All replacements are strictly 1 code unit → 1 code unit, so this transform
 * never changes offsets relative to its input. Runs of spaces are NOT
 * collapsed and nothing is trimmed — that would change offsets in ways that
 * damage code and formatted text.
 *
 * Most exotic spaces are already folded to U+0020 by NFKC; this transform
 * exists so the guarantee holds even when the NFKC step is disabled, and for
 * the few characters NFKC leaves alone (e.g. U+1680 OGHAM SPACE MARK and the
 * dash/quote variants, which are not compatibility-decomposable).
 */
import { MappedTextBuilder, type TransformStepResult, type StepChange } from '../offsetMap.js';

/**
 * code unit → replacement. Every source is a BMP non-surrogate code point and
 * every replacement is a single ASCII character, keeping the transform 1:1.
 * Invisible-looking space characters are keyed by code point to keep literal
 * invisibles out of this file; dashes and quotes are visible and literal.
 */
const REPLACEMENTS: ReadonlyMap<number, string> = new Map<number, string>([
  // Spaces (the complete Zs category except U+0020 itself).
  [0x00a0, ' '], // NO-BREAK SPACE
  [0x1680, ' '], // OGHAM SPACE MARK
  [0x2000, ' '], // EN QUAD
  [0x2001, ' '], // EM QUAD
  [0x2002, ' '], // EN SPACE
  [0x2003, ' '], // EM SPACE
  [0x2004, ' '], // THREE-PER-EM SPACE
  [0x2005, ' '], // FOUR-PER-EM SPACE
  [0x2006, ' '], // SIX-PER-EM SPACE
  [0x2007, ' '], // FIGURE SPACE
  [0x2008, ' '], // PUNCTUATION SPACE
  [0x2009, ' '], // THIN SPACE
  [0x200a, ' '], // HAIR SPACE
  [0x202f, ' '], // NARROW NO-BREAK SPACE
  [0x205f, ' '], // MEDIUM MATHEMATICAL SPACE
  [0x3000, ' '], // IDEOGRAPHIC SPACE
  // Dashes.
  ['‐'.charCodeAt(0), '-'], // U+2010 HYPHEN
  ['‑'.charCodeAt(0), '-'], // U+2011 NON-BREAKING HYPHEN
  ['‒'.charCodeAt(0), '-'], // U+2012 FIGURE DASH
  ['–'.charCodeAt(0), '-'], // U+2013 EN DASH
  ['—'.charCodeAt(0), '-'], // U+2014 EM DASH
  ['―'.charCodeAt(0), '-'], // U+2015 HORIZONTAL BAR
  ['−'.charCodeAt(0), '-'], // U+2212 MINUS SIGN
  // Single quotes.
  ['‘'.charCodeAt(0), "'"], // U+2018
  ['’'.charCodeAt(0), "'"], // U+2019
  ['‚'.charCodeAt(0), "'"], // U+201A
  ['‛'.charCodeAt(0), "'"], // U+201B
  ['‹'.charCodeAt(0), "'"], // U+2039
  ['›'.charCodeAt(0), "'"], // U+203A
  // Double quotes.
  ['“'.charCodeAt(0), '"'], // U+201C
  ['”'.charCodeAt(0), '"'], // U+201D
  ['„'.charCodeAt(0), '"'], // U+201E
  ['‟'.charCodeAt(0), '"'], // U+201F
  ['«'.charCodeAt(0), '"'], // U+00AB
  ['»'.charCodeAt(0), '"'], // U+00BB
]);

export function normalizeWhitespacePunct(text: string): TransformStepResult | null {
  // Fast path: scan for the first replaceable unit; most text has none.
  let first = -1;
  for (let i = 0; i < text.length; i++) {
    if (REPLACEMENTS.has(text.charCodeAt(i))) {
      first = i;
      break;
    }
  }
  if (first === -1) return null;

  const builder = new MappedTextBuilder();
  const changes: StepChange[] = [];
  let cursor = 0;
  for (let i = first; i < text.length; i++) {
    const replacement = REPLACEMENTS.get(text.charCodeAt(i));
    if (replacement === undefined) continue;
    builder.copyVerbatim(text, cursor, i);
    builder.replaceRange(replacement, i, i + 1);
    changes.push({
      kind: 'whitespace-punct',
      start: i,
      end: i + 1,
      before: text[i]!,
      after: replacement,
    });
    cursor = i + 1;
  }
  builder.copyVerbatim(text, cursor, text.length);
  const { text: out, map } = builder.finish(text.length);
  return { text: out, map, changes };
}
