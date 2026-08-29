/**
 * Which model ships, and where it sits in the package.
 *
 * Pinned here rather than passed in so there is exactly one answer, and so the
 * build script and the runtime cannot disagree about what was bundled.
 *
 * The choice is BENCHMARKS.md's M6 selection: xlm-roberta-base-ner-hrl at q8.
 * Quantization was measured to cost nothing on this corpus (+1.5 macro F1 for
 * q8 over fp32, within noise) while being 4x smaller and ~2x faster, and fp16
 * does not run on the onnxruntime CPU/WASM provider at all - both failures are
 * recorded verbatim in BENCHMARKS.md.
 */

/** HF repo id. Also the directory name under MODEL_DIR. */
export const MODEL_ID = 'jiting/xlm-roberta-base-ner-hrl_onnx';

/** Weight precision. See BENCHMARKS.md M6 for why q8 rather than fp32/fp16. */
export const MODEL_DTYPE = 'q8';

/**
 * Package-relative root Transformers.js resolves models under.
 *
 * `env.localModelPath` is joined with the model id, so the on-disk layout must
 * be `<MODEL_DIR>/<MODEL_ID>/...` exactly.
 */
export const MODEL_DIR = 'models/';

/** Where the onnxruntime-web .wasm binaries are copied to. */
export const ORT_DIR = 'ort/';
