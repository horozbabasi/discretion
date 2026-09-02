/**
 * The offscreen document: where the NER model actually runs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE MODEL IS HERE AND NOT IN THE CONTENT SCRIPT
 *
 * Measured, not assumed (packages/extension/scripts/offscreen-probe): a
 * content script CANNOT compile WebAssembly when the host page ships a
 * Content-Security-Policy, and all three target sites do. Compilation throws
 * under `script-src 'self'` and under the realistic `strict-dynamic`+nonce
 * shape Gemini serves. `crossOriginIsolated` is also false in a content
 * script's world, so even where compilation succeeded the runtime would be
 * held to a single thread.
 *
 * An offscreen document is the only context where this extension controls its
 * own CSP. `'wasm-unsafe-eval'` in `content_security_policy.extension_pages`
 * applies here, and so do the manifest's COOP/COEP keys — measured:
 * `crossOriginIsolated === true` in this document, and a Web Worker created
 * from it inherits that.
 *
 * WHY THE SERVICE WORKER IS NOT AN OPTION: MV3 evicts an idle service worker
 * after ~30 s. Model load is 6,568 ms, so eviction would charge the user 6.5
 * seconds on a keystroke, repeatedly.
 *
 * RESIDENCY IS NOT A CONTRACT. This document survived 600 s of idle with its
 * state intact, and Chrome documents that no reason except AUDIO_PLAYBACK
 * imposes a lifetime limit — but `TerminateDocument()` exists unused in the
 * source and Chrome DevRel has said they expect to add teardown checks. So
 * nothing here treats residency as a correctness property: the service worker
 * re-provisions on demand, and a send is blocked while the model is
 * unavailable rather than proceeding unchecked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ChunkCache, NerEngine } from '@discretion/core';
import { createTransformersClassifier } from '@discretion/core/ner-transformers';
import type { NerSpan } from '@discretion/core';

import { NER_CHANNEL } from './protocol.js';
import type { NerRequest, NerResponse, OffscreenStatus } from './protocol.js';
import { MODEL_DIR, MODEL_DTYPE, MODEL_ID, ORT_DIR } from './modelConfig.js';

/** Filled once, on first provision. */
let engine: NerEngine | null = null;
let loadMs: number | null = null;
let loadError: string | null = null;
let threads = 1;
let resolved: { wasmPaths: string | null; simd: string | null; proxy: boolean | null } = {
  wasmPaths: null,
  simd: null,
  proxy: null,
};

/**
 * Configures Transformers.js to read the packaged model and nothing else.
 *
 * Every one of these is load-bearing for SPEC's first non-negotiable — zero
 * runtime network access — and `allowRemoteModels: false` is the one that
 * makes a mistake in the others fail loudly instead of silently fetching from
 * huggingface.co.
 *
 * The model is NOT in `web_accessible_resources`, and does not need to be: an
 * offscreen document loads packaged resources through its own extension
 * origin. Listing it would let the three host sites fetch — and fingerprint —
 * a 280 MB asset.
 */
async function configureRuntime(): Promise<void> {
  const { env } = await import('@huggingface/transformers');
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) {
    // No WASM backend means no local inference, and there is no other backend
    // this extension is allowed to use. Loud rather than silently degraded.
    throw new Error('onnxruntime-web exposes no WASM backend to configure');
  }
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL(MODEL_DIR);
  // The runtime's own .wasm binaries ship in the package too. Left to itself
  // it would resolve them from a CDN, which is the exact failure the
  // no-network rule is about.
  wasm.wasmPaths = chrome.runtime.getURL(ORT_DIR);
  // Threads come from cross-origin isolation, which this document has and a
  // content script does not. Recorded so a silent fallback to one thread is
  // visible in the status rather than only in the latency.
  threads = globalThis.crossOriginIsolated ? (navigator.hardwareConcurrency ?? 4) : 1;
  wasm.numThreads = threads;
  resolved = {
    wasmPaths: typeof wasm.wasmPaths === 'string' ? wasm.wasmPaths : null,
    simd: wasm.simd === undefined ? null : String(wasm.simd),
    proxy: wasm.proxy ?? null,
  };
}

async function ensureEngine(): Promise<NerEngine> {
  if (engine !== null) return engine;
  const started = performance.now();
  await configureRuntime();
  const classifier = await createTransformersClassifier({
    model: MODEL_ID,
    dtype: MODEL_DTYPE,
  });
  engine = new NerEngine(classifier);
  loadMs = performance.now() - started;
  return engine;
}

function status(): OffscreenStatus {
  return {
    ready: engine !== null,
    threads,
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    modelId: engine?.id ?? null,
    ...resolved,
    loadMs: loadMs === null ? null : Math.round(loadMs),
    error: loadError,
  };
}

/** Error text safe to send: name and message, never the payload. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'unknown error';
}

async function handle(request: NerRequest, cache: ChunkCache): Promise<NerResponse> {
  try {
    if (request.op === 'status') {
      return { id: request.id, ok: true, op: 'status', status: status() };
    }
    if (request.op === 'warmup') {
      const ready = await ensureEngine();
      await ready.warmup();
      loadError = null;
      return { id: request.id, ok: true, op: 'warmup' };
    }
    const ready = await ensureEngine();
    const spans: readonly NerSpan[] = await ready.recognize(request.text, cache);
    return { id: request.id, ok: true, op: 'recognize', spans };
  } catch (error) {
    loadError = describe(error);
    return {
      id: request.id,
      ok: false,
      error: loadError,
      // The engine's deadline is a distinct condition from a broken model: one
      // means "too slow this time", the other means "not working at all", and
      // the caller blocks for both but reports them differently.
      ...(error instanceof Error && error.name === 'DetectionTimeoutError'
        ? { timedOut: true }
        : {}),
    };
  }
}

/**
 * Accepts ONLY the NER channel.
 *
 * The name check is the whole discipline described in protocol.ts: exactly one
 * context may accept this channel, so that no other listener can win the race
 * to respond and silently discard the model's answer.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== NER_CHANNEL) return;

  // One cache per CONNECTION, so its lifetime is the content script's session.
  // Its keys are the user's text; owned by the shared engine it would outlive
  // the tab that produced it and be visible to the next one, which is exactly
  // what SPEC's per-tab-session rule forbids. See core/src/ner/chunkCache.ts.
  const cache = new ChunkCache();
  port.onDisconnect.addListener(() => {
    cache.clear();
  });

  port.onMessage.addListener((message: NerRequest) => {
    void handle(message, cache).then(
      (response) => {
        try {
          port.postMessage(response);
        } catch {
          // The content script navigated away mid-inference. Nothing to do:
          // the caller's own deadline covers it.
        }
      },
      (error: unknown) => {
        try {
          port.postMessage({ id: message.id, ok: false, error: describe(error) });
        } catch {
          // As above.
        }
      },
    );
  });
});

// Loading starts as soon as this document exists rather than on first use.
// SPEC: "warm the NER worker" is step 1 of the content-script flow, not step 5;
// the whole point of keeping this document resident is that the 6.5 s load is
// paid once, out of sight, and never on a keystroke.
void ensureEngine().then(
  async () => {
    const ready = engine;
    if (ready !== null) await ready.warmup();
  },
  (error: unknown) => {
    loadError = describe(error);
  },
);
