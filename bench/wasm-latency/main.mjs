// Stage 2 latency on the runtime that actually ships: onnxruntime-web.
//
// The Node build of transformers.js has no WASM execution provider at all
// (dml/webgpu/cpu only), so the shipped configuration cannot be measured from
// Node even in principle. Same benchmark as M8 otherwise - inputs of exactly
// 2000 characters, warmup discarded, same model, same dtype, same machine.
//
// TWO PATHS ARE MEASURED, because they pull the window size in opposite
// directions and a single number hides that:
//
//   COLD - a full 2000-character document with nothing cached. What a paste
//          costs, and what SPEC's budget is written against. Bigger windows
//          win: fewer, larger inferences.
//   INCREMENTAL - one edit, the rest served from a content-hash cache. The
//          interactive steady state while someone types. Smaller windows win:
//          the inference you must redo is cheaper.
//
// Four window sizes are measured rather than two, so the shape of the tradeoff
// is observed rather than interpolated from its endpoints.
import { env, pipeline } from '@huggingface/transformers';

const out = document.getElementById('out');
const log = (line) => {
  out.textContent += `\n${line}`;
  console.log(line);
};

const INPUT_CHARS = 2000;
const WARMUP = 8;
const COLD_SAMPLES = 15;
const INCREMENTAL_SAMPLES = 15;
const OVERLAP = 96;

/**
 * Windows spanning the shipped 400 up to a Latin-safe 1200.
 *
 * Overridable via ?windows=400,1200 so a focused comparison (one runtime
 * against another, or one machine state against another) does not have to pay
 * for the full sweep. A comparison run should always fix every other variable.
 */
const WINDOWS = (new URLSearchParams(location.search).get('windows') ?? '400,600,800,1200')
  .split(',')
  .map((w) => Number.parseInt(w, 10))
  .filter((w) => Number.isFinite(w) && w > 0);

function chunk(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + size);
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

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return { p50: percentile(s, 50), p95: percentile(s, 95), min: s[0], max: s[s.length - 1] };
}

const SEED =
  'Anna Kowalska moved to Warszawa last spring and now works with Boris Petrov in Berlin. ' +
  'Contact: anna.kowalska@example.com, phone +48 22 555 0147, IBAN PL61109010140000071219812874. ' +
  'The invoice from Acme Holdings GmbH references order 4471 and was approved by Maria Gomez in Madrid. ';

function documentOf(n) {
  let text = '';
  while (text.length < INPUT_CHARS) text += SEED.replace('4471', String(4000 + n));
  return text.slice(0, INPUT_CHARS);
}

async function main() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = '/hfmodels/';
  env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency ?? 4;

  const device = new URLSearchParams(location.search).get('device') ?? 'wasm';
  log(
    `device=${device} threads=${env.backends.onnx.wasm.numThreads} crossOriginIsolated=${globalThis.crossOriginIsolated}`,
  );

  const loadStart = performance.now();
  const ner = await pipeline('token-classification', 'jiting/xlm-roberta-base-ner-hrl_onnx', {
    dtype: 'q8',
    ...(device === 'webgpu' ? { device: 'webgpu' } : {}),
  });
  log(`model loaded in ${Math.round(performance.now() - loadStart)} ms (excluded from all timings)`);

  // What the runtime RESOLVED, not what was requested. A silent fallback to
  // single-threaded WASM is a large latency difference and is invisible unless
  // it is read back and printed.
  const w = env.backends.onnx.wasm;
  log(`ort resolved: numThreads=${w.numThreads} simd=${w.simd} proxy=${w.proxy}`);

  const docs = Array.from({ length: Math.max(COLD_SAMPLES, INCREMENTAL_SAMPLES) }, (_, i) =>
    documentOf(i),
  );

  for (let i = 0; i < WARMUP; i += 1) {
    for (const piece of chunk(docs[0], 400)) await ner(piece, { ignore_labels: [] });
  }

  const results = [];
  for (const window of WINDOWS) {
    // COLD: every chunk of a fresh document.
    const cold = [];
    for (let i = 0; i < COLD_SAMPLES; i += 1) {
      const pieces = chunk(docs[i], window);
      const t0 = performance.now();
      for (const piece of pieces) await ner(piece, { ignore_labels: [] });
      cold.push(performance.now() - t0);
    }

    // INCREMENTAL: the user edited ONE CHARACTER somewhere in the document.
    //
    // The first version of this timed the LAST chunk, which was wrong twice
    // over. The trailing chunk is a remainder whose length depends on the
    // window (176 chars at window 400, 896 at window 1200), so it compared
    // chunk sizes rather than windows. And it understated the cost, because an
    // edit inside a 96-char overlap region invalidates TWO chunks, not one.
    //
    // This version edits at a spread of positions across the document,
    // recomputes the chunking, and re-infers exactly those chunks whose text
    // actually changed - which is what a content-hash cache would do.
    const incremental = [];
    const changedCounts = [];
    for (let i = 0; i < INCREMENTAL_SAMPLES; i += 1) {
      const doc = docs[i];
      const at = Math.floor(((i + 0.5) / INCREMENTAL_SAMPLES) * doc.length);
      const edited = `${doc.slice(0, at)}${String.fromCharCode(97 + (i % 26))}${doc.slice(at + 1)}`;
      const before = chunk(doc, window);
      const after = chunk(edited, window);
      const stale = after.filter((piece, idx) => piece !== before[idx]);
      changedCounts.push(stale.length);
      const t0 = performance.now();
      for (const piece of stale) await ner(piece, { ignore_labels: [] });
      incremental.push(performance.now() - t0);
    }

    const c = stats(cold);
    const inc = stats(incremental);
    const chunks = chunk(docs[0], window).length;
    const meanChanged = changedCounts.reduce((a, b) => a + b, 0) / changedCounts.length;
    const r = {
      window,
      chunks,
      cold: c,
      incremental: inc,
      meanChunksReinferred: meanChanged,
      perInference: c.p50 / chunks,
    };
    results.push(r);
    log(
      `window ${String(window).padStart(4)}: ${chunks} chunks | cold p50 ${c.p50.toFixed(0)} p95 ${c.p95.toFixed(0)} | incr p50 ${inc.p50.toFixed(0)} p95 ${inc.p95.toFixed(0)} (${meanChanged.toFixed(2)} re-inferred) | ${r.perInference.toFixed(0)}ms/inference`,
    );
  }

  globalThis.__BENCH__ = {
    runtime: device === 'webgpu' ? 'onnxruntime-web (WebGPU)' : 'onnxruntime-web (WASM)',
    threads: env.backends.onnx.wasm.numThreads,
    simd: env.backends.onnx.wasm.simd,
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    inputChars: INPUT_CHARS,
    coldSamples: COLD_SAMPLES,
    incrementalSamples: INCREMENTAL_SAMPLES,
    results,
  };
  out.dataset.done = '1';
}

main().catch((e) => {
  log(`FAILED: ${e?.message ?? e}`);
  out.dataset.done = 'error';
});
