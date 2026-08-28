from playwright.sync_api import sync_playwright
import json, sys, os

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge', args=['--enable-unsafe-webgpu','--enable-features=Vulkan'])
    page = b.new_page()
    page.on('console', lambda m: print('  [console]', m.text) if m.type in ('error','warning') else None)
    page.on('pageerror', lambda e: print('  [pageerror]', e))
    page.goto('http://localhost:5199/?device=' + os.environ.get('DEVICE','wasm'), wait_until='domcontentloaded')
    try:
        page.wait_for_selector('#out[data-done="1"]', timeout=900_000)
    except Exception:
        print(page.locator('#out').inner_text())
        b.close(); sys.exit(1)
    res = page.evaluate('window.__BENCH__')
    print(json.dumps(res, indent=2))
    b.close()
