/**
 * Stage 2 latency THROUGH the offscreen boundary, measured from a content
 * script.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The pre-IPC figures in BENCHMARKS.md were taken in a plain page with the
 * model in the same context (`bench/wasm-latency/main.mjs`). Wiring the model
 * into an offscreen document adds a process boundary to the hot path, and the
 * only honest way to report that cost is to run the SAME benchmark on the
 * other side of it: same 2,000-character documents, same 96-character overlap,
 * same warmup discipline, same machine, back to back.
 *
 * WHAT DIFFERS FROM THE SHIPPED BUILD, stated because it is a deviation: this
 * entry point is compiled only by `build.mjs --bench`, into a copy of the
 * build whose manifest also matches `http://localhost/*`. Nothing else
 * changes — same content script code path, same port, same protocol, same
 * offscreen document. The shipped manifest never references this file.
 *
 * WHY IT USES `PortNerRecognizer` RATHER THAN ITS OWN CLIENT: measuring a
 * hand-written client would measure the harness. This is the class the
 * extension actually uses.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PortNerRecognizer } from '../detection/portRecognizer.js';

const INPUT_CHARS = 2000;
const WARMUP = 8;
const COLD_SAMPLES = 15;
const INCREMENTAL_SAMPLES = 15;

/** Identical to bench/wasm-latency/main.mjs, so the documents match. */
const SEED =
  'Anna Kowalska moved to Warszawa last spring and now works with Boris Petrov in Berlin. ' +
  'Contact: anna.kowalska@example.com, phone +48 22 555 0147, IBAN PL61109010140000071219812874. ' +
  'The invoice from Acme Holdings GmbH references order 4471 and was approved by Maria Gomez in Madrid. ';

function documentOf(n: number): string {
  let text = '';
  while (text.length < INPUT_CHARS) text += SEED.replace('4471', String(4000 + n));
  return text.slice(0, INPUT_CHARS);
}

function percentile(sorted: readonly number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i] ?? 0;
}

function stats(samples: readonly number[]): Record<string, number> {
  const s = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(s, 50),
    p95: percentile(s, 95),
    min: s[0] ?? 0,
    max: s[s.length - 1] ?? 0,
  };
}

interface BenchResult {
  readonly topology: string;
  readonly status: unknown;
  readonly ipcRoundTripMs: Record<string, number>;
  readonly cold: Record<string, number>;
  readonly incremental: Record<string, number>;
  readonly meanEntitiesPerDocument: number;
}

async function run(): Promise<BenchResult> {
  const recognizer = new PortNerRecognizer();

  // The model load is excluded from every timing below, exactly as the pre-IPC
  // benchmark excludes it. It is reported separately because it is the number
  // the offscreen decision rests on.
  await recognizer.warmup();
  const status = await recognizer.refreshStatus();

  const docs = Array.from({ length: Math.max(COLD_SAMPLES, INCREMENTAL_SAMPLES) }, (_, i) =>
    documentOf(i),
  );

  // The crossing on its own, with no inference behind it: `status` does no
  // model work, so this isolates transport plus serialization from the thing
  // being transported.
  const rtt: number[] = [];
  for (let i = 0; i < 40; i += 1) {
    const t0 = performance.now();
    await recognizer.refreshStatus();
    rtt.push(performance.now() - t0);
  }

  // Warmed on a document that is NOT in the measured set. Warming on docs[0]
  // put its chunks in the cache, and the first "cold" sample then measured a
  // cache hit: 1.1 ms for a 2,000-character document. The number looked like a
  // triumph and was a broken measurement.
  const warmupDoc = documentOf(9_000);
  for (let i = 0; i < WARMUP; i += 1) await recognizer.recognize(warmupDoc);

  // COLD: a full document with NOTHING cached.
  //
  // The cache is per-connection, so dropping the port between samples is what
  // makes each one genuinely cold - and it does it by exercising the real
  // lifetime mechanism rather than by adding a reset back-door to the shipped
  // protocol. The model stays loaded either way: it lives in the offscreen
  // document, not in the connection.
  const cold: number[] = [];
  let entityTotal = 0;
  for (let i = 0; i < COLD_SAMPLES; i += 1) {
    recognizer.disconnect();
    const t0 = performance.now();
    const spans = await recognizer.recognize(docs[i] as string);
    cold.push(performance.now() - t0);
    entityTotal += spans.length;
  }

  // INCREMENTAL: one character edited in a document the cache already holds.
  // The offscreen chunk cache serves every unchanged chunk, so what is measured
  // is the crossing plus re-inference of only the chunks the edit invalidated —
  // which is what the pre-IPC harness SIMULATED and the extension now does.
  const incremental: number[] = [];
  for (let i = 0; i < INCREMENTAL_SAMPLES; i += 1) {
    const doc = docs[i] as string;
    // Each sample starts from a connection that has seen ONLY this document,
    // which is the interactive steady state: the user has typed this message
    // and is still editing it. Priming inside the loop keeps every sample
    // identical instead of letting later ones inherit earlier documents.
    recognizer.disconnect();
    await recognizer.recognize(doc);

    const at = Math.floor(((i + 0.5) / INCREMENTAL_SAMPLES) * doc.length);
    const edited = `${doc.slice(0, at)}${String.fromCharCode(97 + (i % 26))}${doc.slice(at + 1)}`;
    const t0 = performance.now();
    await recognizer.recognize(edited);
    incremental.push(performance.now() - t0);
  }

  return {
    topology: 'content script -> port -> offscreen document (one crossing per recognize)',
    status,
    ipcRoundTripMs: stats(rtt),
    cold: stats(cold),
    incremental: stats(incremental),
    meanEntitiesPerDocument: entityTotal / COLD_SAMPLES,
  };
}

// Driven from the page over postMessage, because a content script's world is
// not the page's and the driver evaluates in the page's.
window.addEventListener('message', (event: MessageEvent) => {
  const data: unknown = event.data;
  if (event.source !== window) return;
  if (typeof data !== 'object' || data === null || !('__psBench' in data)) return;

  void run().then(
    (result) => window.postMessage({ __psBenchResult: result }, '*'),
    (error: unknown) => {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
      window.postMessage({ __psBenchResult: { error: detail } }, '*');
    },
  );
});

document.documentElement.setAttribute('data-ps-bench-ready', '1');
