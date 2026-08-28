# Playwright driver for the browser-side latency benchmark.
#
# HEADLESS defaults to 1. Note that Playwright injects
# --enable-unsafe-swiftshader in headless mode, which is a SOFTWARE
# rasterizer: any WebGPU number measured headless is a measurement of
# SwiftShader, not of the GPU. Run with HEADLESS=0 to measure the real
# adapter.
from playwright.sync_api import sync_playwright
import json, sys, os, time

DEVICE = os.environ.get('DEVICE', 'wasm')
HEADLESS = os.environ.get('HEADLESS', '1') != '0'

args = ['--enable-unsafe-webgpu', '--enable-features=Vulkan']

with sync_playwright() as p:
    # Edge occasionally fails to hand back its first process; retry rather
    # than lose a 20-minute run to a transient launch failure.
    b = None
    for attempt in range(3):
        try:
            b = p.chromium.launch(headless=HEADLESS, channel='msedge', args=args)
            break
        except Exception as e:
            print(f'launch attempt {attempt + 1} failed: {type(e).__name__}', flush=True)
            time.sleep(3)
    if b is None:
        print('FAILED: browser would not launch after 3 attempts')
        sys.exit(1)

    page = b.new_page()
    page.on('console', lambda m: print('  [console]', m.text) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: print('  [pageerror]', e))
    page.on('response', lambda r: print('  [http]', r.status, r.url) if r.status >= 400 else None)
    page.on('requestfailed', lambda r: print('  [reqfail]', r.url, r.failure))

    # Report what the browser actually resolved the adapter to, so a software
    # fallback is visible in the output instead of being reported as WebGPU.
    page.goto('http://localhost:5211/?device=' + DEVICE, wait_until='domcontentloaded')
    adapter = page.evaluate("""async () => {
        if (!navigator.gpu) return { webgpu: false };
        const a = await navigator.gpu.requestAdapter();
        if (!a) return { webgpu: true, adapter: null };
        const i = a.info ?? (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
        return { webgpu: true, vendor: i.vendor, architecture: i.architecture,
                 device: i.device, description: i.description };
    }""")
    print('adapter: ' + json.dumps(adapter), flush=True)
    print(f'headless: {HEADLESS}', flush=True)

    try:
        page.wait_for_selector('#out[data-done="1"]', timeout=1_800_000)
    except Exception:
        print(page.locator('#out').inner_text())
        b.close()
        sys.exit(1)

    res = page.evaluate('window.__BENCH__')
    res['adapter'] = adapter
    res['headless'] = HEADLESS
    print(json.dumps(res, indent=2))
    b.close()
