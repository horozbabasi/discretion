/**
 * align.ts — map model token pieces back to exact character spans.
 *
 * Transformers.js exposes no offset mapping, so spans are recovered by
 * scanning the input LEFT TO RIGHT and matching each piece at (or just
 * after) the cursor. This is exact for pieces that are verbatim substrings
 * — the overwhelming case, since Stage 2 runs on Stage-0-normalized text
 * and the candidate models' tokenizers (mBERT WordPiece, XLM-R
 * SentencePiece) do NFKC-compatible normalization the input has already
 * been through. The exceptions are handled explicitly:
 *
 *  • '##piece'  — WordPiece continuation: match the bare piece.
 *  • '▁piece'   — SentencePiece word start: match the bare piece ('▁'
 *                 alone is a zero-width word boundary).
 *  • '[UNK]' / '<unk>' — unlocatable: recorded as zero-width at the
 *                 cursor; the entity merger bridges across them.
 *  • normalization stragglers — a bounded forward search (SEARCH_WINDOW)
 *                 recovers when the tokenizer skipped or rewrote a
 *                 character; a piece not found within the window is
 *                 treated like [UNK] rather than being guessed at.
 *
 * Whitespace between pieces is consumed by skipping it before each match.
 * Greedy left-to-right matching is order-safe because pieces arrive in
 * input order.
 */

/** How far past the cursor a piece may be found before we refuse to guess. */
const SEARCH_WINDOW = 24;

const UNKNOWN_PIECES = new Set(['[UNK]', '<unk>']);

export interface AlignedPiece {
  /** Start offset in the input (inclusive); equals `end` when unlocated. */
  readonly start: number;
  /** End offset in the input (exclusive). */
  readonly end: number;
  /** False for [UNK]/unfindable pieces — zero-width placeholders. */
  readonly located: boolean;
}

const WHITESPACE = /\s/;

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && WHITESPACE.test(text[i]!)) i += 1;
  return i;
}

/** Strip subword markers down to the piece's surface text. */
function surfaceOf(piece: string): string {
  if (piece.startsWith('##')) return piece.slice(2);
  if (piece.startsWith('▁')) return piece.slice(1); // '▁'
  return piece;
}

/** Align every piece to its character span in `text`. */
export function alignPieces(text: string, pieces: readonly string[]): AlignedPiece[] {
  const aligned: AlignedPiece[] = [];
  let cursor = 0;

  for (const raw of pieces) {
    const piece = surfaceOf(raw);
    if (piece.length === 0 || UNKNOWN_PIECES.has(raw)) {
      aligned.push({ start: cursor, end: cursor, located: false });
      continue;
    }

    const from = skipWhitespace(text, cursor);
    let at = -1;
    if (text.startsWith(piece, from)) {
      at = from;
    } else {
      const found = text.indexOf(piece, from);
      if (found !== -1 && found - from <= SEARCH_WINDOW) at = found;
    }

    if (at === -1) {
      aligned.push({ start: cursor, end: cursor, located: false });
      continue;
    }
    aligned.push({ start: at, end: at + piece.length, located: true });
    cursor = at + piece.length;
  }

  return aligned;
}
