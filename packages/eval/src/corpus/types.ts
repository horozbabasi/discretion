/**
 * Corpus types: labeled synthetic documents with ground-truth spans.
 *
 * Ground-truth offsets are indices into the ORIGINAL document text — the
 * same coordinate system `Stage1Candidate.originalStart/End` reports through
 * the Stage 0 offset map, so scoring is a direct span comparison with no
 * re-mapping step that could itself be wrong.
 */

import type { EntityType } from '@discretion/core';

export type DocType =
  | 'prose'
  | 'email'
  | 'code'
  | 'json'
  | 'yaml'
  | 'csv'
  | 'log'
  | 'medical'
  | 'contract'
  | 'cv'
  | 'markdown-table';

export const DOC_TYPES: readonly DocType[] = [
  'prose', 'email', 'code', 'json', 'yaml', 'csv', 'log', 'medical', 'contract', 'cv', 'markdown-table',
];

/** One planted sensitive value with its exact original-text span. */
export interface GroundTruthEntity {
  readonly type: EntityType;
  /** The concrete scheme (generator kind), e.g. 'tckn', 'iban', 'btc'. */
  readonly scheme: string;
  /** Exact text as planted, including any injected obfuscation characters. */
  readonly text: string;
  /** Start offset in the ORIGINAL document text (inclusive). */
  readonly start: number;
  /** End offset (exclusive). */
  readonly end: number;
  /** True when zero-width obfuscation was injected inside the value. */
  readonly obfuscated: boolean;
}

export interface LabeledDocument {
  readonly id: string;
  readonly language: string;
  readonly docType: DocType;
  readonly text: string;
  readonly entities: readonly GroundTruthEntity[];
  /**
   * True for hard-negative documents: they contain NO ground-truth
   * entities, only content that merely resembles sensitive data. Any
   * sensitive detection inside one is a false positive by construction.
   */
  readonly hardNegative: boolean;
}
