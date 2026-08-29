# Probe 2: the two claims probe 1 did NOT actually test.
#
#   G. Can a content script compile WebAssembly IN ITS OWN ISOLATED WORLD when
#      the host page ships a restrictive CSP? Probe 1 compiled WASM in the
#      page's MAIN world, which is a different world with a different policy
#      and says nothing about this. This is the claim the offscreen permission
#      justification rests on, so it is measured rather than asserted.
#      Measured under three host-page policies: none, script-src 'self', and
#      a policy copied from a real target site.
#
#   H. CONTROL for probe 1's swBootCount==1. That could mean "the offscreen
#      document keeps the service worker alive" or "the debugger this test is
#      driven through keeps it alive". Running the identical idle wait with NO
#      offscreen document tells the two apart. Naming a condition that has not
#      been varied is worse than naming none.
import http.server
import json
import os
import socketserver
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
EXT = HERE / 'ext'
PORT = 5289
IDLE = int(os.environ.get('IDLE', '120'))

# Real policies, fetched from the target sites; see csp_headers.json. Kept as a
# literal so the test is reproducible without network access.
CSP_CASES = {
    'none': None,
    'self-only': "script-src 'self'; object-src 'none'",
    'strict-dynamic-nonce': "script-src 'nonce-abc123' 'strict-dynamic' 'unsafe-inline' https:; object-src 'none'; base-uri 'none'",
}


class Host(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_a):
        pass

    def do_GET(self):
        case = self.path.lstrip('/').split('?')[0] or 'none'
        csp = CSP_CASES.get(case)
        body = f'<!doctype html><meta charset="utf-8"><title>{case}</title><p>{case}'.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        if csp:
            self.send_header('Content-Security-Policy', csp)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


threading.Thread(
    target=lambda: socketserver.TCPServer(('127.0.0.1', PORT), Host).serve_forever(), daemon=True
).start()

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

results = {'idleSeconds': IDLE, 'cspCases': {}, 'control': {}}

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'],
    )
    try:
        # ── G: WASM in the content script's isolated world, per host CSP ──
        for case in CSP_CASES:
            page = ctx.new_page()
            page.goto(f'http://localhost:{PORT}/{case}', wait_until='domcontentloaded')
            page.wait_for_selector('html[data-ps-probe-ready="1"]', state='attached', timeout=20000)
            got = page.evaluate(BRIDGE, {'op': 'wasm-here'})
            results['cspCases'][case] = {'sentPolicy': CSP_CASES[case], **(got or {})}
            print(f'  [csp:{case}] {json.dumps(results["cspCases"][case])[:300]}')
            page.close()

        # ── H: control. No offscreen document; same idle wait. ──
        page = ctx.new_page()
        page.goto(f'http://localhost:{PORT}/none', wait_until='domcontentloaded')
        page.wait_for_selector('html[data-ps-probe-ready="1"]', state='attached', timeout=20000)
        before = page.evaluate(BRIDGE, {'target': 'sw', 'op': 'status'})
        print(f'  [control:before] hasDocument={before.get("hasDocument")} boots={len(before.get("swBoots") or [])}')
        page.close()

        print(f'control: idling {IDLE}s with NO offscreen document')
        time.sleep(IDLE)

        page = ctx.new_page()
        page.goto(f'http://localhost:{PORT}/none', wait_until='domcontentloaded')
        page.wait_for_selector('html[data-ps-probe-ready="1"]', state='attached', timeout=20000)
        after = page.evaluate(BRIDGE, {'target': 'sw', 'op': 'status'})
        page.close()
        results['control'] = {
            'hasDocumentBefore': before.get('hasDocument'),
            'hasDocumentAfter': after.get('hasDocument'),
            'swBootsBefore': len(before.get('swBoots') or []),
            'swBootsAfter': len(after.get('swBoots') or []),
            'swBootNonceBefore': before.get('swBootNonce'),
            'swBootNonceAfter': after.get('swBootNonce'),
            'serviceWorkerRestarted': before.get('swBootNonce') != after.get('swBootNonce'),
        }
        print(f'  [control:after] {json.dumps(results["control"])}')
    finally:
        ctx.close()

out = HERE / 'probe2-result.json'
out.write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'\nwrote {out}')
