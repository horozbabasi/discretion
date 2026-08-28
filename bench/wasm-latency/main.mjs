// WASM NER latency, measured in a real browser.
//
// The Node build of transformers.js only offers dml/webgpu/cpu — it has no
// WASM path at all — so every latency number published so far is
// onnxruntime-node on native CPU. The extension runs onnxruntime-web on WASM,
// and SPEC's budget applies to what ships. This measures that.
//
// Deliberately the SAME benchmark as M8: inputs of exactly 2000 characters,
// warmup discarded, same model, same dtype, same machine. Only the runtime
// differs, so the comparison isolates it.
import { env, pipeline } from '@huggingface/transformers';

const out = document.getElementById('out');
const log = (line) => {
  out.textContent += `\n${line}`;
  console.log(line);
};

const INPUT_CHARS = 2000;
const WARMUP = 10;
const SAMPLES = 60;

// Same chunking bound Stage 2 uses, so the number of inferences per input
// matches production rather than being an artefact of the harness.
const OVERLAP = 96;
// Measured at both the shipped 400-char window and a Latin-safe 1200, to
// quantify what script-aware sizing would buy before scoping it in.
const WINDOWS = [400, 1200];

function chunk(text, MAX_INPUT_CHARS) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + MAX_INPUT_CHARS);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - OVERLAP;
  }
  return chunks;
}

function percentile(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

async function main() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/hfmodels/';
  env.backends.onnx.wasm.wasmPaths = undefined; // bundled default
  env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ?? 4;

  log(`threads requested: ${env.backends.onnx.wasm.numThreads}`);
  log(`crossOriginIsolated: ${globalThis.crossOriginIsolated}`);

  // Device is selectable so WASM and WebGPU can be compared on identical
  // inputs; ?device=webgpu switches it.
  const device = new URLSearchParams(location.search).get('device') ?? 'wasm';
  log(`device requested: ${device}`);
  const loadStart = performance.now();
  const ner = await pipeline('token-classification', 'jiting/xlm-roberta-base-ner-hrl_onnx', {
    dtype: 'q8',
    ...(device === 'webgpu' ? { device: 'webgpu' } : {}),
  });
  log(`model loaded in ${Math.round(performance.now() - loadStart)} ms (warmup excluded from timings)`);

  // Realistic 2000-character inputs: repeated prose with identifiers, in the
  // same shape the corpus produces.
  const seed =
    'Anna Kowalska moved to Warszawa last spring and now works with Boris Petrov in Berlin. ' +
    'Contact: anna.kowalska@example.com, phone +48 22 555 0147, IBAN PL61109010140000071219812874. ' +
    'The invoice from Acme Holdings GmbH references order 4471 and was approved by Maria Gomez in Madrid. ';
  const inputs = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    let text = '';
    while (text.length < INPUT_CHARS) text += seed.replace('4471', String(4000 + i));
    inputs.push(text.slice(0, INPUT_CHARS));
  }

  const results = [];
  for (const window of WINDOWS) {
    const runOne = async (text) => {
      for (const piece of chunk(text, window)) await ner(piece, { ignore_labels: [] });
    };

    for (let i = 0; i < WARMUP; i += 1) await runOne(inputs[i % inputs.length]);

    const samples = [];
    for (const text of inputs) {
      const t0 = performance.now();
      await runOne(text);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);

    const r = {
      window,
      chunksPerInput: chunk(inputs[0], window).length,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      max: samples[samples.length - 1],
    };
    results.push(r);
    log(`window ${window}: ${r.chunksPerInput} chunks, p50 ${r.p50.toFixed(1)} p95 ${r.p95.toFixed(1)} p99 ${r.p99.toFixed(1)} -> ${r.p50 < 250 && r.p95 < 600 ? 'WITHIN' : 'OVER'} budget`);
  }

  globalThis.__BENCH__ = {
    runtime: device === 'webgpu' ? 'onnxruntime-web (WebGPU)' : 'onnxruntime-web (WASM)',
    threads: env.backends.onnx.wasm.numThreads,
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    inputChars: INPUT_CHARS,
    samples: SAMPLES,
    results,
  };
  out.dataset.done = '1';
}

main().catch((e) => {
  log(`FAILED: ${e?.message ?? e}`);
  out.dataset.done = 'error';
});
