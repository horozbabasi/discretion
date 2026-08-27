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
}

/**
 * Stage 2 candidates share Stage 1's shape (SPEC: one candidate contract
 * for the whole pipeline), differing only in the stage tag.
 */
export interface Stage2Candidate extends Omit<Stage1Candidate, 'stage'> {
  readonly stage: 'stage2-ner';
}
