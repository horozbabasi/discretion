/**
 * chunk.ts — window long inputs so the model sees ALL of the text.
 *
 * Transformer runtimes silently truncate past their token limit (verified
 * against the actual runtime: a 3000-character input stopped producing
 * predictions at token 512 with no error). Undetected text would be
 * undetected sensitive data, so the engine windows the input in CHARACTER
 * units — safe because the worst tokenizer ratio is one token per
 * character (CJK) — with an overlap wide enough that any entity split by
 * one window boundary lies fully inside a neighbouring window.
 *
 * De-duplication rule for the overlap: a window "owns" the entities whose
 * span midpoint falls in its core (the window minus half an overlap at
 * each interior edge). Every midpoint lands in exactly one core, so each
 * entity is emitted exactly once, and — because overlap/2 exceeds any
 * plausible entity length — the owning window saw the whole entity.
 */

export interface Chunk {
  /** Offset of this window's first character in the full text. */
  readonly offset: number;
  readonly text: string;
  /** Core region (absolute offsets): this window owns midpoints in it. */
  readonly coreStart: number;
  readonly coreEnd: number;
}

/** Look this far back from a hard cut for a whitespace break. */
const BREAK_LOOKBACK = 80;

export function chunkText(text: string, maxChars: number, overlapChars: number): Chunk[] {
  if (maxChars <= overlapChars * 2) {
    throw new Error(`chunkText: maxChars ${maxChars} must exceed twice the overlap ${overlapChars}`);
  }
  if (text.length <= maxChars) {
    return [{ offset: 0, text, coreStart: 0, coreEnd: text.length }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Prefer to cut at whitespace so a word (and usually an entity) is
      // not split at the hard boundary of BOTH neighbouring windows.
      for (let i = end; i > end - BREAK_LOOKBACK && i > start + overlapChars; i--) {
        if (/\s/.test(text[i - 1]!)) {
          end = i;
          break;
        }
      }
    }
    const isFirst = start === 0;
    const isLast = end === text.length;
    chunks.push({
      offset: start,
      text: text.slice(start, end),
      coreStart: isFirst ? 0 : start + Math.floor(overlapChars / 2),
      coreEnd: isLast ? text.length : end - Math.floor(overlapChars / 2),
    });
    if (isLast) break;
    start = end - overlapChars;
  }
  return chunks;
}
