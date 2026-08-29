// The offscreen document under test.
//
// Holds a MODULE-EVALUATION NONCE and an allocated buffer. If Chrome tears the
// document down and something re-creates it, the nonce changes - which is the
// only way to tell "still resident" from "quietly restarted", and the two look
// identical to hasDocument().

const BOOT = {
  nonce: `off-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  bootedAt: Date.now(),
};

// A stand-in for a loaded model: 64 MB of live, touched memory. If the document
// is torn down this is reclaimed and the nonce check will catch it; holding
// real memory also makes any OOM-driven teardown observable.
const HELD = new Uint8Array(64 * 1024 * 1024);
for (let i = 0; i < HELD.length; i += 4096) HELD[i] = i & 0xff;

let heldChecksum = 0;
for (let i = 0; i < HELD.length; i += 1024 * 1024) heldChecksum = (heldChecksum + HELD[i]) >>> 0;

// ── environment facts, captured once ────────────────────────────────────────
const env = {
  crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
  hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  hardwareConcurrency: navigator.hardwareConcurrency ?? null,
  origin: location.origin,
  wasm: null,
  worker: null,
};

// Can this context compile WebAssembly at all? The whole reason for existing.
try {
  // Minimal valid module: (module (func (export "f") (result i32) i32.const 42))
  const bytes = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 2, 1, 0, 7, 5, 1,
    1, 102, 0, 0, 10, 6, 1, 4, 0, 65, 42, 11,
  ]);
  const mod = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(mod);
  env.wasm = { compiled: true, result: inst.exports.f() };
} catch (e) {
  env.wasm = { compiled: false, error: String(e?.message ?? e) };
}

// Does a Web Worker created here inherit cross-origin isolation? That is what
// decides whether onnxruntime-web gets threads.
const workerReady = (async () => {
  try {
    const src = `self.postMessage({
      crossOriginIsolated: Boolean(self.crossOriginIsolated),
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      canGrowShared: (() => { try { new SharedArrayBuffer(8); return true; } catch (e) { return String(e && e.message || e); } })()
    });`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    const result = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('worker timeout 5s')), 5000);
      w.onmessage = (e) => {
        clearTimeout(t);
        resolve(e.data);
      };
      w.onerror = (e) => {
        clearTimeout(t);
        reject(new Error(e.message || 'worker error'));
      };
    });
    w.terminate();
    URL.revokeObjectURL(url);
    env.worker = { created: true, ...result };
  } catch (e) {
    env.worker = { created: false, error: String(e?.message ?? e) };
  }
})();

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== 'offscreen') return;

  if (msg.op === 'ping') {
    // Re-derive the checksum so the answer proves the memory is still THERE,
    // not merely that a variable holding a number survived.
    let sum = 0;
    for (let i = 0; i < HELD.length; i += 1024 * 1024) sum = (sum + HELD[i]) >>> 0;
    respond({
      ok: true,
      nonce: BOOT.nonce,
      bootedAt: BOOT.bootedAt,
      ageMs: Date.now() - BOOT.bootedAt,
      heldBytes: HELD.length,
      checksumMatches: sum === heldChecksum,
      env,
    });
    return true;
  }

  if (msg.op === 'env') {
    workerReady.then(() => respond({ ok: true, nonce: BOOT.nonce, env }));
    return true;
  }

  if (msg.op === 'fetch-packaged') {
    // Can an offscreen document read a packaged resource that is NOT listed in
    // web_accessible_resources? If yes, the 280 MB model never has to be made
    // reachable by the host sites at all.
    (async () => {
      const out = {};
      for (const name of ['sw.js', 'offscreen.js', 'manifest.json']) {
        try {
          const r = await fetch(chrome.runtime.getURL(name));
          out[name] = { ok: r.ok, status: r.status, bytes: (await r.arrayBuffer()).byteLength };
        } catch (e) {
          out[name] = { ok: false, error: String((e && e.message) || e) };
        }
      }
      respond({ ok: true, nonce: BOOT.nonce, fetched: out });
    })();
    return true;
  }

  if (msg.op === 'echo') {
    // Round-trip latency probe: the payload comes back untouched so the cost
    // measured is transport plus structured clone, with no work in between.
    respond({ ok: true, nonce: BOOT.nonce, bytes: msg.payload?.length ?? 0, payload: msg.payload });
    return true;
  }

  return undefined;
});
