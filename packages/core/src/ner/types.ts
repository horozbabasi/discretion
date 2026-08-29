/**
 * Stage 2 (multilingual NER) — shared types.
 *
 * The model runtime is INJECTED behind `TokenClassifier`, so the pure parts
 * of Stage 2 (piece→character alignment, BIO decoding, chunking, timeout
 * discipline, candidate shaping) are testable without a model and the
 * engine stays environment-agnostic. The Transformers.js-backed classifier
 * lives in `transformersClassifier.ts`, exported through its own package
 * entry point so that consumers who never run NER never load the runtime.
 */

import type { Stage1Candidate } from '../detect/types.js';
import type { GazetteerHit } from '../gazetteer/index.js';

/** One model token prediction, in input order, special tokens excluded. */
export interface TokenPrediction {
  /** Raw model label, e.g. 'B-PER', 'I-ORG', 'O'. */
  readonly label: string;
  /** Model softmax score for that label. */
  readonly score: number;
  /**
   * The token's surface piece as the runtime reports it: WordPiece
   * continuations keep their '##' prefix; SentencePiece markers ('▁') may
   * or may not be present — the aligner handles both.
   */
  readonly piece: string;
}

/** The injected model runtime. */
export interface TokenClassifier {
  /** Identifies the model in candidate metadata, e.g. 'distilmbert-ner-hrl@q8'. */
  readonly id: string;
  /**
   * Safe per-call input size in CHARACTERS. Text longer than this must be
   * windowed by the caller: transformer runtimes silently truncate past
   * their token limit, and silent truncation would be silent fail-open.
   * The floor of one token per character (CJK) makes chars the safe unit.
   */
  readonly maxInputChars: number;
  /** Classify one window of text. Pieces arrive in input order. */
  classify(text: string): Promise<readonly TokenPrediction[]>;
}

export type NerEntityType = 'PERSON' | 'ORG' | 'LOCATION';

/** A merged entity span in NORMALIZED-text coordinates. */
export interface NerSpan {
  readonly type: NerEntityType;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Minimum token score across the entity — the conservative aggregate. */
  readonly score: number;
  /**
   * Stage 2b corroboration, when the gazetteer knows this name.
   *
   * Attached HERE rather than looked up in Stage 3 because SPEC places the
   * gazetteers in Stage 2 — "checked in parallel with the model" — and
   * because the sets are only meaningful for the types the model produces.
   * See ner/stage2b.ts for what that placement was costing.
   *
   * Absent on a miss. "Not in the gazetteer" is not evidence against a name.
   */
  readonly gazetteer?: GazetteerHit;
}

/**
 * What Stage 2 needs from whatever performs recognition.
 *
 * An interface rather than the concrete `NerEngine` because the engine may not
 * be in the same PROCESS as the pipeline. The extension runs the model in an
 * offscreen document - a content script cannot compile WebAssembly under the
 * host page's policy - so its Stage 2 is a proxy that forwards `recognize`
 * across a message port and returns the spans that come back.
 *
 * Declared here, next to the span it returns, so that `runStage2` and
 * `detect` can name it without importing `engine.ts`. That matters: engine.ts
 * pulls in Stage 2b and therefore the gazetteers, and a value import of it
 * from the pipeline would link 3.4 MB of Bloom filters into every bundle that
 * runs detection, including the one that has no model at all.
 */
export interface NerRecognizer {
  /** Model identity, recorded on every candidate this produces. */
  readonly id: string;
  /** Pay initialization cost before first real use. */
  warmup(): Promise<void>;
  /** Spans in the given text's own coordinates. */
  recognize(text: string): Promise<NerSpan[]>;
}

/**
 * Stage 2 candidates share Stage 1's shape (SPEC: one candidate contract
 * for the whole pipeline), differing only in the stage tag.
 */
export interface Stage2Candidate extends Omit<Stage1Candidate, 'stage'> {
  readonly stage: 'stage2-ner';
  /** Stage 2b corroboration, carried through to Stage 3's scorer. */
  readonly gazetteer?: GazetteerHit;
}
