// Service worker for the offscreen-lifetime probe.
//
// Counts its own module evaluations in chrome.storage.local. A count above 1
// means Chrome evicted and restarted it, which is observable WITHOUT attaching
// a debugger to the worker - attaching would keep it alive and the measurement
// would be of the observer.

const BOOT_NONCE = `sw-${Math.random().toString(36).slice(2)}-${Date.now()}`;

async function recordBoot() {
  const { swBoots = [] } = await chrome.storage.local.get('swBoots');
  swBoots.push({ nonce: BOOT_NONCE, at: Date.now() });
  await chrome.storage.local.set({ swBoots });
}
recordBoot();

async function ensureOffscreen(reason) {
  const has = await chrome.offscreen.hasDocument();
  if (has) return { created: false };
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [reason],
    justification: 'Runs a local WebAssembly NER model; a content script cannot compile WASM under the host page CSP.',
  });
  return { created: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.target !== 'sw') return;

  (async () => {
    if (msg.op === 'ensure') {
      try {
        const r = await ensureOffscreen(msg.reason ?? 'WORKERS');
        respond({ ok: true, ...r, swBootNonce: BOOT_NONCE });
      } catch (e) {
        respond({ ok: false, error: String(e?.message ?? e), swBootNonce: BOOT_NONCE });
      }
      return;
    }
    if (msg.op === 'status') {
      let has = null;
      let err = null;
      try {
        has = await chrome.offscreen.hasDocument();
      } catch (e) {
        err = String(e?.message ?? e);
      }
      const { swBoots = [] } = await chrome.storage.local.get('swBoots');
      respond({ ok: true, hasDocument: has, error: err, swBootNonce: BOOT_NONCE, swBoots });
      return;
    }
    if (msg.op === 'close') {
      try {
        await chrome.offscreen.closeDocument();
        respond({ ok: true });
      } catch (e) {
        respond({ ok: false, error: String(e?.message ?? e) });
      }
      return;
    }
    respond({ ok: false, error: `unknown op ${String(msg.op)}` });
  })();

  return true; // async respond
});
