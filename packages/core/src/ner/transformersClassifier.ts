/**
 * transformersClassifier.ts — the Transformers.js/ONNX-backed
 * TokenClassifier. Runs identically in Node (onnxruntime-node) and in a
 * browser Web Worker (onnxruntime-web/WASM); hosting it in a worker is the
 * consumer's concern (extension, M9), which keeps this module free of any
 * environment-specific API.
 *
 * ZERO NETWORK BY DEFAULT: remote model fetching is opt-in
 * (`allowRemoteModels`), used only by build-time tooling (the eval
 * benchmark, the model-fetch script). Production consumers load from the
 * bundled cache and never touch the network — the SPEC non-negotiable.
 *
 * This module is exported through the dedicated `./ner-transformers` entry
 * point, NOT the package root, so consumers who never run Stage 2 never
 * load the ONNX runtime.
 */

import { env, pipeline } from '@huggingface/transformers';
import type { TokenClassifier, TokenPrediction } from './types.js';

export interface TransformersClassifierOptions {
  /** HF repo id, e.g. 'Xenova/distilbert-base-multilingual-cased-ner-hrl'. */
  readonly model: string;
  /** Weight precision: 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | …. */
  readonly dtype?: string;
  /** Where model files live (bundle dir in production, cache in tooling). */
  readonly cacheDir?: string;
  /** Allow downloading missing models. Build-time tooling ONLY. */
  readonly allowRemoteModels?: boolean;
  /**
   * Pinned repo revision (commit hash). HF commits are content-addressed,
   * so a pinned revision pins the exact model bytes — the integrity story
   * for build-time bundling. Default 'main' is acceptable only in
   * exploratory tooling.
   */
  readonly revision?: string;
  /** Short id for candidate metadata; defaults to model@dtype. */
  readonly id?: string;
  /**
   * Per-window character budget. Default 400: the models' 512-token limit
   * divided by the worst-case one-token-per-character ratio (CJK), with
   * headroom for specials and subword expansion of unusual codepoints.
   */
  readonly maxInputChars?: number;
}

interface RawTokenOutput {
  readonly entity: string;
  readonly score: number;
  readonly word: string;
}

const DEFAULT_MAX_INPUT_CHARS = 400;

export async function createTransformersClassifier(
  options: TransformersClassifierOptions,
): Promise<TokenClassifier> {
  if (options.cacheDir !== undefined) env.cacheDir = options.cacheDir;
  env.allowRemoteModels = options.allowRemoteModels ?? false;

  const dtype = options.dtype ?? 'q8';
  const nerPipeline = await pipeline('token-classification', options.model, {
    dtype: dtype as never, // the runtime validates; its literal union lags its own docs
    ...(options.revision !== undefined ? { revision: options.revision } : {}),
  });

  const id = options.id ?? `${options.model.split('/').pop() ?? options.model}@${dtype}`;
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;

  return {
    id,
    maxInputChars,
    async classify(text: string): Promise<readonly TokenPrediction[]> {
      const raw = (await nerPipeline(text, { ignore_labels: [] })) as readonly RawTokenOutput[];
      return raw.map((t) => ({ label: t.entity, score: t.score, piece: t.word }));
    },
  };
}
