/**
 * Transform 1: STRIP INVISIBLES.
 *
 * Removes zero-width and bidi control characters:
 *   U+200B–U+200F  (ZWSP, ZWNJ, ZWJ, LRM, RLM)
 *   U+202A–U+202E  (bidi embedding/override controls)
 *   U+2060–U+2064  (word joiner, invisible operators)
 *   U+FEFF         (BOM / zero-width no-break space)
 *   U+00AD         (soft hyphen)
 *
 * These are pure noise for detection and are the classic obfuscation vector
 * (a ZWSP dropped into the middle of "john@example.com"), so they go first —
 * they interfere with every transform downstream.
 *
 * TWO CHARACTERS IN THE SET ARE SOMETIMES STRUCTURAL, NOT NOISE:
 *
 * THE EMOJI EXCEPTION — ZWJ (U+200D) inside an emoji sequence joins the
 * sequence together; stripping it would corrupt 👨‍👩‍👧 into 👨👩👧. Per UAX #29,
 * ZWJ and ZWNJ are the only characters in the strip set that can sit INSIDE
 * a grapheme cluster (all the others have Grapheme_Cluster_Break=Control and
 * form their own clusters), so the rule is: leave any cluster containing an
 * Extended_Pictographic code point completely untouched.
 *
 * THE JOINING-SCRIPT EXCEPTION — ZWNJ (U+200C) is linguistically MEANINGFUL
 * in scripts with cursive joining or conjunct formation: in Persian/Urdu and
 * other Arabic-script languages it controls letter shaping and word
 * segmentation (می‌خواهم), and in Indic scripts it suppresses conjuncts
 * (क्‌ष renders dead consonant + ssa instead of the kṣa ligature). Stripping
 * it there CORRUPTS the text. Rule (mirroring the emoji reasoning): preserve
 * ZWNJ when its nearest substantive neighbors on BOTH sides — skipping other
 * invisibles and combining marks — belong to a ZWNJ-using script. Everywhere
 * else (Latin ligature suppression, obfuscation, stray controls) it is noise
 * and is stripped.
 */
import { MappedTextBuilder, type TransformStepResult, type StepChange } from '../offsetMap.js';
import { graphemeSegmenter } from './graphemes.js';

// The character class is assembled from code points rather than written as
// literals so no invisible characters hide in this source file.
const cc = (cp: number): string => String.fromCharCode(cp);
const INVISIBLE = new RegExp(
  `[${cc(0x00ad)}${cc(0x200b)}-${cc(0x200f)}${cc(0x202a)}-${cc(0x202e)}` +
    `${cc(0x2060)}-${cc(0x2064)}${cc(0xfeff)}]`,
);
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/**
 * Scripts in which ZWNJ carries meaning: the cursive-joining family (Arabic
 * script as used by Persian, Urdu, Kurdish, …; Syriac; Mongolian) and the
 * Brahmic/Indic family (conjunct and ligature control). Note these are
 * Unicode Script properties, deliberately independent of the coarser
 * ScriptName buckets used for dominance elsewhere.
 */
const ZWNJ_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}]/u;
const COMBINING_MARK = /\p{M}/u;

function isInvisible(cp: number): boolean {
  return (
    cp === 0x00ad ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    cp === 0xfeff
  );
}

/**
 * Walk from `from` in `step` direction to the nearest code point that is
 * neither a strippable invisible nor a combining mark, and report whether it
 * belongs to a ZWNJ-using script.
 *
 * Marks are skippable because ZWNJ legitimately follows them (the canonical
 * Hindi use is ZWNJ directly after the virama; Arabic harakat may also sit
 * between the letter and the ZWNJ) — but a mark that itself carries a
 * ZWNJ-script Script property (like the virama, Script=Devanagari) already
 * answers the question and short-circuits to true.
 */
function neighborSupportsZwnj(text: string, from: number, step: -1 | 1): boolean {
  let i = from;
  while (step === -1 ? i > 0 : i < text.length) {
    let j: number;
    let cp: number;
    if (step === -1) {
      // Move one code point left, respecting surrogate pairs.
      j = i - 1;
      cp = text.charCodeAt(j);
      if (cp >= 0xdc00 && cp <= 0xdfff && j > 0) {
        const high = text.charCodeAt(j - 1);
        if (high >= 0xd800 && high <= 0xdbff) {
          j -= 1;
          cp = text.codePointAt(j)!;
        }
      }
    } else {
      j = i;
      cp = text.codePointAt(j)!;
    }
    const char = String.fromCodePoint(cp);
    if (ZWNJ_SCRIPT.test(char)) return true;
    if (!isInvisible(cp) && !COMBINING_MARK.test(char)) return false;
    i = step === -1 ? j : j + char.length;
  }
  return false; // ran off the edge of the text
}

/** True when the ZWNJ at `zwnjIndex` sits between ZWNJ-using-script text. */
function shouldPreserveZwnj(text: string, zwnjIndex: number): boolean {
  return neighborSupportsZwnj(text, zwnjIndex, -1) && neighborSupportsZwnj(text, zwnjIndex + 1, 1);
}

export function stripInvisibles(text: string): TransformStepResult | null {
  if (!INVISIBLE.test(text)) return null; // fast path: nothing to strip

  const builder = new MappedTextBuilder();
  const changes: StepChange[] = [];

  for (const { segment, index } of graphemeSegmenter.segment(text)) {
    const segmentEnd = index + segment.length;
    if (!INVISIBLE.test(segment)) {
      builder.copyVerbatim(text, index, segmentEnd);
      continue;
    }
    if (EXTENDED_PICTOGRAPHIC.test(segment)) {
      // Emoji cluster: its ZWJs (and any variation selectors) are structural.
      builder.copyVerbatim(text, index, segmentEnd);
      continue;
    }
    // Non-emoji cluster containing at least one invisible: strip code-point-wise.
    let pos = index;
    for (const char of segment) {
      const charEnd = pos + char.length;
      const cp = char.codePointAt(0)!;
      if (cp === 0x200c && shouldPreserveZwnj(text, pos)) {
        // Joining-script ZWNJ: structural, keep it (see header).
        builder.copyVerbatim(text, pos, charEnd);
      } else if (isInvisible(cp)) {
        builder.deleteRange(pos, charEnd);
        changes.push({
          kind: 'strip-invisibles',
          start: pos,
          end: charEnd,
          before: char,
          after: '',
        });
      } else {
        builder.copyVerbatim(text, pos, charEnd);
      }
      pos = charEnd;
    }
  }

  // Every invisible was structural (emoji ZWJ / joining-script ZWNJ).
  if (changes.length === 0) return null;

  const { text: out, map } = builder.finish(text.length);
  return { text: out, map, changes };
}
