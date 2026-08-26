/**
 * pipeline.ts — the playground's single entry into core: normalize, run
 * Stage 1, mask into a fresh session vault. No detection logic lives here;
 * this package only calls core and renders what comes back.
 *
 * WHY LIVE DETECTION: analysis re-runs on every (debounced) edit because M3
 * measured the full Stage 0+1 pass at p50 0.14 ms / p99 1.05 ms per
 * document — orders of magnitude under a keystroke. On-demand would add a
 * button to save time nobody spends.
 *
 * WHY A FRESH VAULT PER RUN: the playground re-analyzes the WHOLE text each
 * edit, so consistency (same value → same surrogate) is guaranteed within
 * the run by the masker itself, and the deterministic per-value seeding
 * keeps surrogates stable across edits too. A vault accumulated across
 * edits would accrete entries for values the user has since deleted.
 * Per-tab vault lifecycle is extension work (M9).
 */

import { maskOriginal, normalize, runStage1 } from '@privacyshield/core';
import type { MaskResult, Stage1Candidate, SubstitutionMode } from '@privacyshield/core';
import { Vault } from '@privacyshield/core';

export interface AnalysisResult {
  readonly original: string;
  readonly candidates: readonly Stage1Candidate[];
  readonly maskResult: MaskResult;
  readonly mode: SubstitutionMode;
  /** Wall-clock for normalize + Stage 1 + mask, in milliseconds. */
  readonly elapsedMs: number;
}

export type AnalyzeFn = (text: string, mode: SubstitutionMode, seed: number) => AnalysisResult;

export const analyze: AnalyzeFn = (text, mode, seed) => {
  const started = performance.now();
  const normalization = normalize(text);
  const candidates = runStage1(normalization);
  const vault = new Vault();
  const maskResult = maskOriginal(text, candidates, vault, { mode, seed });
  const elapsedMs = performance.now() - started;
  return { original: text, candidates, maskResult, mode, elapsedMs };
};

/** One random session seed so two visitors see different surrogates. */
export function randomSessionSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! & 0x7fffffff;
}
