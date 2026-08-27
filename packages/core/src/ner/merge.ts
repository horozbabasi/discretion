/**
 * merge.ts — decode per-token BIO labels into entity spans.
 *
 * Handles BOTH tagging conventions the candidate models use:
 *  • IOB2 (mBERT/distilmBERT NER-HRL): entities start with B-X.
 *  • IOB1 (XLM-R CoNLL fine-tunes): entities may start with I-X after O
 *    or at sequence start; B-X appears only to split adjacent same-type
 *    entities.
 * Decoding rule that satisfies both: a token starts a NEW entity when its
 * label is B-X, or when it is I-X and the previous token was not part of
 * an X entity. Same-type I-X continues; any other label ends the entity.
 *
 * Unlocated pieces ([UNK] and friends) inside an entity are BRIDGED: the
 * entity's span runs from its first located piece to its last located
 * piece. An entity with no located piece at all is dropped — emitting a
 * guessed span would violate the exact-offsets contract.
 *
 * The entity score is the MINIMUM token score — one uncertain token makes
 * the whole span uncertain. Scores are uncalibrated model softmax until
 * Stage 4 (M8) calibrates; the eval buckets measure what they are worth.
 */

import type { AlignedPiece } from './align.js';
import type { NerEntityType, NerSpan, TokenPrediction } from './types.js';

/** Model label suffix → PrivacyShield entity type. MISC and friends drop. */
const DEFAULT_LABEL_TYPES: Readonly<Record<string, NerEntityType>> = {
  PER: 'PERSON',
  PERSON: 'PERSON',
  ORG: 'ORG',
  LOC: 'LOCATION',
  LOCATION: 'LOCATION',
  GPE: 'LOCATION',
};

interface Open {
  type: NerEntityType;
  start: number;
  end: number;
  score: number;
  located: boolean;
}

function labelParts(label: string): { prefix: 'B' | 'I' | 'O'; type?: NerEntityType } {
  if (label === 'O' || label === '') return { prefix: 'O' };
  const dash = label.indexOf('-');
  const prefix = label.slice(0, dash === -1 ? undefined : dash);
  const suffix = dash === -1 ? label : label.slice(dash + 1);
  const type = DEFAULT_LABEL_TYPES[suffix.toUpperCase()];
  if ((prefix === 'B' || prefix === 'I') && type !== undefined) {
    return { prefix, type };
  }
  return { prefix: 'O' };
}

/** Decode predictions + aligned spans into merged entity spans. */
export function decodeEntities(
  text: string,
  predictions: readonly TokenPrediction[],
  aligned: readonly AlignedPiece[],
): NerSpan[] {
  const spans: NerSpan[] = [];
  let open: Open | null = null;

  const close = (): void => {
    if (open !== null && open.located && open.end > open.start) {
      spans.push({
        type: open.type,
        start: open.start,
        end: open.end,
        text: text.slice(open.start, open.end),
        score: open.score,
      });
    }
    open = null;
  };

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i]!;
    const span = aligned[i];
    if (span === undefined) break; // defensive: prediction/alignment mismatch
    const { prefix, type } = labelParts(pred.label);

    if (prefix === 'O' || type === undefined) {
      close();
      continue;
    }

    const continues = open !== null && open.type === type && prefix === 'I';
    if (continues && open !== null) {
      if (span.located) {
        if (!open.located) open.start = span.start; // first located piece
        open.end = span.end;
        open.located = true;
      }
      open.score = Math.min(open.score, pred.score);
    } else {
      close();
      open = {
        type,
        start: span.start,
        end: span.end,
        score: pred.score,
        located: span.located,
      };
    }
  }
  close();

  return spans.map(trimSpan(text)).filter((s): s is NerSpan => s !== null);
}

/** Trim surrounding whitespace the model occasionally absorbs into a span. */
function trimSpan(text: string): (s: NerSpan) => NerSpan | null {
  return (s) => {
    let { start, end } = s;
    while (start < end && /\s/.test(text[start]!)) start += 1;
    while (end > start && /\s/.test(text[end - 1]!)) end -= 1;
    if (end <= start) return null;
    if (start === s.start && end === s.end) return s;
    return { ...s, start, end, text: text.slice(start, end) };
  };
}
