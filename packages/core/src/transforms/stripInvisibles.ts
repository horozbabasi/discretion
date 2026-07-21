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
 * THE EMOJI EXCEPTION: ZWJ (U+200D) inside an emoji sequence is structural,
 * not noise — stripping it would corrupt 👨‍👩‍👧 into 👨👩👧. Per UAX #29, ZWJ and
 * ZWNJ are the only characters in the strip set that can sit INSIDE a
 * grapheme cluster (all the others have Grapheme_Cluster_Break=Control and
 * form their own clusters). So the rule is: leave any cluster containing an
 * Extended_Pictographic code point completely untouched, and strip inside
 * everything else.
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

function isInvisible(cp: number): boolean {
  return (
    cp === 0x00ad ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    cp === 0xfeff
  );
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
      if (isInvisible(char.codePointAt(0)!)) {
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

  // Every invisible was inside an emoji cluster → the text is unchanged.
  if (changes.length === 0) return null;

  const { text: out, map } = builder.finish(text.length);
  return { text: out, map, changes };
}
