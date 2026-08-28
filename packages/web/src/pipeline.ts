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

import {
  calibrate,
  computeExposure,
  maskOriginal,
  normalize,
  resolveOverlaps,
  runStage1,
} from '@privacyshield/core';
import { CALIBRATION_MODEL } from '@privacyshield/data';
import type {
  CalibrationModel,
  ExposureReport,
  MaskResult,
  Stage1Candidate,
  SubstitutionMode,
} from '@privacyshield/core';
import { Vault } from '@privacyshield/core';

export interface AnalysisResult {
  readonly original: string;
  readonly candidates: readonly Stage1Candidate[];
  readonly maskResult: MaskResult;
  readonly mode: SubstitutionMode;
  /** Wall-clock for normalize + Stage 1 + mask, in milliseconds. */
  readonly elapsedMs: number;
  /**
   * Document exposure, computed from CALIBRATED confidence.
   *
   * The bundled calibration model is what makes this honest: an exposure
   * score built on raw detector confidence would be adding up numbers that
   * are not comparable across types, which is the exact problem calibration
   * exists to remove. See ARCHITECTURE.md D23.
   */
  readonly exposure: ExposureReport;
}

/** The committed model, shaped for core's calibrator. */
const MODEL = CALIBRATION_MODEL as unknown as CalibrationModel;

export type AnalyzeFn = (text: string, mode: SubstitutionMode, seed: number) => AnalysisResult;

export const analyze: AnalyzeFn = (text, mode, seed) => {
  const started = performance.now();
  const normalization = normalize(text);
  const candidates = runStage1(normalization);
  const vault = new Vault();
  const maskResult = maskOriginal(text, candidates, vault, { mode, seed });

  // Exposure runs on RESOLVED candidates: an unresolved set double-counts
  // every overlap, so a single credential covered by three detectors would
  // inflate the score threefold.
  const resolved = resolveOverlaps(
    candidates
      .filter((c) => c.sensitive)
      .map((c) => ({ candidate: c, confidence: c.rawConfidence })),
  );
  const exposure = computeExposure(
    resolved.emitted.map((item) => ({
      type: item.candidate.type,
      calibratedConfidence: calibrate(MODEL, item.candidate.type, item.confidence),
    })),
  );

  const elapsedMs = performance.now() - started;
  return { original: text, candidates, maskResult, mode, elapsedMs, exposure };
};

/** One random session seed so two visitors see different surrogates. */
export function randomSessionSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! & 0x7fffffff;
}
