# Which weight file does each side actually load?
#
# The paired run showed the offscreen path 3.1x FASTER on the cold path than
# the in-page baseline. A measurement that much better than the thing it is
# compared against is a defect report about the measurement, and the ratio is
# suspiciously close to fp32-versus-q8. The extension can only load q8 - it is
# the only weights file in the package. The baseline is served from .hf-cache,
# which also holds a 1.1 GB fp32 model.
#
# So: watch the network and record which file is requested.
import json
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
HARNESS = REPO / 'bench' / 'wasm-latency'
PORT = 5202

requests = []
server = subprocess.Popen(
    ['npx.cmd', 'vite', '--port', str(PORT), '--strictPort'],
    cwd=HARNESS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    time.sleep(6)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=False, channel='msedge')
        page = b.new_page()
        page.on('request', lambda r: requests.append(r.url) if ('.onnx' in r.url or '.wasm' in r.url) else None)
        page.goto(f'http://localhost:{PORT}/?windows=400', wait_until='domcontentloaded')
        # Only the load matters; kill it once the model is in.
        try:
            page.wait_for_function(
                "document.getElementById('out').textContent.includes('model loaded')", timeout=600_000
            )
        except Exception as e:
            print('load never reported:', e)
        text = page.locator('#out').inner_text()
        b.close()
finally:
    server.terminate()

print('--- harness log ---')
print(text)
print('--- model/wasm requests ---')
for url in requests:
    print(' ', url)
Path(__file__).resolve().parent.joinpath('which-weights.json').write_text(
    json.dumps({'requests': requests, 'log': text}, indent=2), encoding='utf-8'
)
