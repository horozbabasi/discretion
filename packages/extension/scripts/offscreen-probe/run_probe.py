# Empirically answers the offscreen-document questions the NER decision rests
# on, in a real browser. The documentation is corroboration; this is the
# authority.
#
# What it measures, and why each one matters:
#   A. Does the offscreen document survive an idle period LONGER than the
#      service worker's 30s eviction window, with its state intact? A nonce
#      captured at module evaluation answers "still resident" vs "quietly
#      restarted" - hasDocument() alone cannot tell those apart.
#   B. Does the service worker get evicted while the offscreen document lives?
#      Counted via chrome.storage.local writes at SW module evaluation, so the
#      observation needs no debugger attached to the worker. Attaching one
#      keeps it alive, and the measurement would then be of the observer.
#   C. Is crossOriginIsolated true inside the offscreen document, and does a
#      Web Worker created there inherit it? That decides whether WASM gets
#      threads - worth 4-8x on inference.
#   D. Can the offscreen document compile WebAssembly at all?
#   E. Can a CONTENT SCRIPT reach the offscreen document directly, or must it
#      hop through the service worker? One hop or two on the hot path.
#   F. Round-trip IPC cost by payload size, with no work at the far end.
import http.server
import json
import os
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
EXT = HERE / 'ext'
PORT = 5288
IDLE_CHECKS = [int(x) for x in os.environ.get('IDLE_CHECKS', '45,120,300').split(',')]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        body = b'<!doctype html><meta charset="utf-8"><title>probe host</title><p>probe host page'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve():
    with socketserver.TCPServer(('127.0.0.1', PORT), Quiet) as httpd:
        httpd.serve_forever()


threading.Thread(target=serve, daemon=True).start()

REASON = os.environ.get('REASON', 'WORKERS')
results = {'reason': REASON, 'idleChecks': IDLE_CHECKS, 'steps': []}


# Evaluated in the MAIN world, which is where page.evaluate runs. Injecting a
# helper via a <script> tag does not work: the browser applies its own CSP to
# the host page and blocks inline execution.
BRIDGE = """async (msg) => {
  const id = Math.random().toString(36).slice(2);
  const reply = new Promise((resolve) => {
    const onMsg = (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.__psProbe !== 'response' || d.id !== id) return;
      window.removeEventListener('message', onMsg);
      resolve(d.payload);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ ok: false, error: 'bridge timeout 15s' }); }, 15000);
  });
  window.postMessage({ __psProbe: 'request', id, msg }, '*');
  return reply;
}"""


def step(name, data):
    results['steps'].append({'name': name, **data})
    print(f'  [{name}] {json.dumps(data)[:400]}')


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'],
    )
    try:
        page = ctx.new_page()
        page.goto(f'http://localhost:{PORT}/', wait_until='domcontentloaded')
        page.wait_for_selector('html[data-ps-probe-ready="1"]', state='attached', timeout=20000)
        print('content script attached')

        def from_page(msg, target_page=None):
            return (target_page or page).evaluate(BRIDGE, msg)

        # ── create the offscreen document, via the service worker ──
        created = from_page({'target': 'sw', 'op': 'ensure', 'reason': REASON})
        step('create', created)
        if not created.get('ok'):
            print('FAIL: could not create the offscreen document')
            results['fatal'] = created
            raise SystemExit(1)

        # ── E: can a content script reach the offscreen document DIRECTLY? ──
        direct = from_page({'target': 'offscreen', 'op': 'ping'})
        step('content-script-direct-to-offscreen', direct)

        # ── C + D: environment inside the offscreen document ──
        envr = from_page({'target': 'offscreen', 'op': 'env'})
        step('offscreen-environment', envr)

        # For comparison: the same facts in the CONTENT SCRIPT's world, which is
        # the host page's origin and the reason the model cannot run there.
        page_env = page.evaluate(
            """() => {
              let wasm;
              try {
                const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,5,1,1,102,0,0,10,6,1,4,0,65,42,11]);
                new WebAssembly.Instance(new WebAssembly.Module(bytes));
                wasm = { compiled: true };
              } catch (e) { wasm = { compiled: false, error: String(e && e.message || e) }; }
              return {
                crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
                hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
                wasm,
              };
            }"""
        )
        step('host-page-environment', page_env)

        baseline_nonce = direct.get('nonce') if direct.get('ok') else None
        results['offscreenNonce'] = baseline_nonce

        # ── F: IPC round-trip cost by payload size ──
        rtt = {}
        for size in (0, 400, 2000, 20000):
            payload = 'x' * size
            # The bridge is written out inline rather than eval'd from a
            # string: the host page's CSP has no 'unsafe-eval', so eval would
            # be blocked and the failure would look like an IPC problem.
            samples = page.evaluate(
                """async ({ payload, n }) => {
                  const call = (msg) => new Promise((resolve) => {
                    const id = Math.random().toString(36).slice(2);
                    const onMsg = (e) => {
                      if (e.source !== window) return;
                      const d = e.data;
                      if (!d || d.__psProbe !== 'response' || d.id !== id) return;
                      window.removeEventListener('message', onMsg);
                      resolve(d.payload);
                    };
                    window.addEventListener('message', onMsg);
                    window.postMessage({ __psProbe: 'request', id, msg }, '*');
                  });
                  const out = [];
                  for (let i = 0; i < n; i += 1) {
                    const t0 = performance.now();
                    await call({ target: 'offscreen', op: 'echo', payload });
                    out.push(performance.now() - t0);
                  }
                  out.sort((a, b) => a - b);
                  return out;
                }""",
                {'payload': payload, 'n': 60},
            )
            rtt[str(size)] = {
                'p50': round(samples[len(samples) // 2], 3),
                'p95': round(samples[int(len(samples) * 0.95)], 3),
                'min': round(samples[0], 3),
                'max': round(samples[-1], 3),
            }
        step('ipc-round-trip-ms-by-payload-chars', rtt)

        # ── A + B: the idle test ──
        # The page is closed so nothing on it can hold anything alive, and no
        # message is sent during the wait: a message would itself be activity.
        page.close()
        print(f'idling; checks at {IDLE_CHECKS}s')
        start = time.time()
        for mark in IDLE_CHECKS:
            wait = mark - (time.time() - start)
            if wait > 0:
                time.sleep(wait)
            probe = ctx.new_page()
            probe.goto(f'http://localhost:{PORT}/', wait_until='domcontentloaded')
            probe.wait_for_selector('html[data-ps-probe-ready="1"]', state='attached', timeout=20000)
            ping = probe.evaluate(BRIDGE, {'target': 'offscreen', 'op': 'ping'})
            status = probe.evaluate(BRIDGE, {'target': 'sw', 'op': 'status'})
            probe.close()
            step(
                f'after-{mark}s-idle',
                {
                    'offscreenAlive': bool(ping.get('ok')),
                    'sameOffscreenNonce': ping.get('nonce') == baseline_nonce,
                    'offscreenNonce': ping.get('nonce'),
                    'offscreenAgeMs': ping.get('ageMs'),
                    'heldMemoryIntact': ping.get('checksumMatches'),
                    'hasDocument': status.get('hasDocument'),
                    'swBootCount': len(status.get('swBoots') or []),
                    'swBootNonce': status.get('swBootNonce'),
                },
            )
    finally:
        ctx.close()

out = HERE / 'probe-result.json'
out.write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'\nwrote {out}')
