# Stage 2 latency through the offscreen boundary, and the pre-IPC baseline,
# measured BACK TO BACK in the same machine state.
#
# Two runs in one script on purpose. D27 is the record of what happens when a
# 4x anomaly gets attributed to a condition nobody varied; comparing today's
# IPC numbers against figures taken on a different day, at a different battery
# and thermal state, would be that mistake with extra steps. So the baseline is
# re-measured here, immediately before or after, and both are reported.
#
#   BASELINE  bench/wasm-latency (model in the page, no extension involved)
#   IPC       the built extension: content script -> port -> offscreen document
#
# Run:
#   node packages/extension/scripts/build.mjs --bench
#   python bench/ipc-latency/run.py
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import baseline_server

REPO = Path(__file__).resolve().parents[2]
BUILD = REPO / 'packages' / 'extension' / 'build'
PORT = 5301
BASELINE_PORT = 5199

RESULTS = {'machine': {}, 'baseline': None, 'ipc': None}


class Host(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_a):
        pass

    def do_GET(self):
        body = b'<!doctype html><meta charset="utf-8"><title>ipc bench</title><p>bench host'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


threading.Thread(
    target=lambda: socketserver.TCPServer(('127.0.0.1', PORT), Host).serve_forever(), daemon=True
).start()

DRIVE = """async () => {
  const done = new Promise((resolve) => {
    const onMsg = (e) => {
      if (e.source !== window) return;
      if (!e.data || !e.data.__psBenchResult) return;
      window.removeEventListener('message', onMsg);
      resolve(e.data.__psBenchResult);
    };
    window.addEventListener('message', onMsg);
  });
  window.postMessage({ __psBench: true }, '*');
  return done;
}"""


def machine_state():
    """Battery and CPU throttle state, recorded with the numbers.

    D27: a 4x latency anomaly was once attributed to mains-vs-battery on a
    single co-occurrence and the attribution was wrong. Recording the state is
    not the same as explaining it, and only the first is claimed here.
    """
    state = {}
    try:
        out = subprocess.run(
            ['powershell', '-NoProfile', '-Command',
             '(Get-CimInstance Win32_Battery).BatteryStatus, (Get-CimInstance Win32_Battery).EstimatedChargeRemaining'],
            capture_output=True, text=True, timeout=30,
        ).stdout.split()
        if len(out) >= 2:
            state['batteryStatus'] = out[0]
            state['batteryPercent'] = out[1]
    except Exception as e:  # noqa: BLE001 - recorded, not acted on
        state['batteryError'] = str(e)
    return state


def measure_ipc():
    if not (BUILD / 'bench.js').is_file():
        print('FAIL: build/bench.js missing. Run: node packages/extension/scripts/build.mjs --bench')
        sys.exit(1)

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir='',
            channel='msedge',
            headless=False,
            args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        )
        try:
            page = ctx.new_page()
            page.on('console', lambda m: print('  [console]', m.text[:200]) if m.type == 'error' else None)
            page.on('pageerror', lambda e: print('  [pageerror]', str(e)[:300]))
            page.goto(f'http://localhost:{PORT}/', wait_until='domcontentloaded')
            page.wait_for_selector('html[data-ps-bench-ready="1"]', state='attached', timeout=30000)
            print('bench content script attached; running (model load included in the first call)')
            return page.evaluate(DRIVE)
        finally:
            ctx.close()


def canary(label):
    """Machine-speed reading, so a figure says which state it was taken in.

    D27a: this machine enters a state where inference is 4-5x slower, and
    nothing in the numbers says which state produced them. See
    bench/machine-canary.mjs. A degraded verdict does not stop the run - the
    measurement is still worth having - but it is recorded ON the result so it
    cannot later be compared against a healthy one without that being visible.
    """
    import json as _json
    import subprocess as _sp
    out = _sp.run(['node', str(REPO / 'bench' / 'check-canary.mjs')],
                  capture_output=True, text=True, cwd=str(REPO))
    try:
        reading = _json.loads(out.stdout)
    except Exception:
        reading = {'verdict': 'unavailable', 'stderr': out.stderr[:200]}
    print(f'canary ({label}): {reading.get("verdict")} '
          f'ratio={reading.get("ratio")} ms={reading.get("canaryMs")}')
    if reading.get('verdict') == 'degraded':
        print('  *** MACHINE DEGRADED - this figure is NOT comparable to one '
              'taken in the healthy state (ARCHITECTURE.md D27a) ***')
    return reading


def measure_baseline():
    """Re-runs bench/wasm-latency at window 400, with no bundler in the path."""
    httpd = baseline_server.serve(BASELINE_PORT)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=False, channel='msedge')
            page = b.new_page()
            page.on('console', lambda m: print('  [console]', m.text[:200]))
            page.on('requestfailed', lambda r: print('  [failed]', r.url[:120], r.failure))
            page.goto(f'http://127.0.0.1:{BASELINE_PORT}/?windows=400', wait_until='domcontentloaded')
            page.wait_for_selector('#out[data-done="1"]', timeout=900_000)
            got = page.evaluate('window.__BENCH__')
            b.close()
            return got
    finally:
        httpd.shutdown()
        httpd.server_close()


RESULTS['canaryBefore'] = canary('before')
RESULTS['machine'] = machine_state()
print(f'machine: {json.dumps(RESULTS["machine"])}')

order = os.environ.get('ORDER', 'baseline,ipc').split(',')
for which in order:
    if which == 'baseline':
        print('\n=== BASELINE: model in the page, no extension ===')
        RESULTS['baseline'] = measure_baseline()
        print(json.dumps(RESULTS['baseline'], indent=2)[:2000])
    elif which == 'ipc':
        print('\n=== IPC: content script -> port -> offscreen document ===')
        RESULTS['ipc'] = measure_ipc()
        print(json.dumps(RESULTS['ipc'], indent=2)[:2000])

out = Path(__file__).resolve().parent / 'result.json'
# Taken BEFORE the file is written, or it would not be in it.
RESULTS['canaryAfter'] = canary('after')

out.write_text(json.dumps(RESULTS, indent=2), encoding='utf-8')
print(f'\nwrote {out}')

