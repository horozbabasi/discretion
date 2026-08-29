// Content script: proves (or disproves) that a content script can reach the
// offscreen document directly, without a service-worker hop.
//
// Bridged over window.postMessage because a content script runs in an ISOLATED
// WORLD - anything it puts on `window` is invisible to the page and to the test
// driver, which evaluates in the main world. Readiness is announced through the
// DOM, which both worlds do share.
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__psProbe !== 'request') return;

  // Answering, from inside the ISOLATED WORLD, the question the whole
  // offscreen decision rests on: can a content script compile WebAssembly?
  // The earlier probe compiled WASM in the page's MAIN world, which is a
  // different world with a different CSP and says nothing about this one.
  if (data.msg && data.msg.op === 'wasm-here') {
    let wasm;
    try {
      const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,5,1,1,102,0,0,10,6,1,4,0,65,42,11]);
      const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes));
      wasm = { compiled: true, result: inst.exports.f() };
    } catch (e) { wasm = { compiled: false, error: String((e && e.message) || e) }; }
    let streaming = null;
    try {
      // The path onnxruntime-web actually takes for a real .wasm file.
      const url = chrome.runtime.getURL('tiny.wasm');
      const r = await fetch(url);
      const m = await WebAssembly.compileStreaming(r);
      streaming = { compiled: Boolean(m) };
    } catch (e) { streaming = { compiled: false, error: String((e && e.message) || e) }; }
    window.postMessage({ __psProbe: 'response', id: data.id, payload: {
      ok: true, world: 'content-script-isolated',
      crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      wasm, streaming,
      pageCsp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null,
    } }, '*');
    return;
  }

  let settled = false;
  const reply = (payload) => {
    if (settled) return;
    settled = true;
    window.postMessage({ __psProbe: 'response', id: data.id, payload }, '*');
  };
  const timer = setTimeout(() => reply({ ok: false, error: 'timeout 10s' }), 10000);

  try {
    chrome.runtime.sendMessage(data.msg, (r) => {
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      reply(err ? { ok: false, error: err.message } : r);
    });
  } catch (e) {
    clearTimeout(timer);
    reply({ ok: false, error: String((e && e.message) || e) });
  }
});

document.documentElement.setAttribute('data-ps-probe-ready', '1');
