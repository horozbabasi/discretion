# Verifies the BUILT extension actually loads in a browser.
#
# "The build wrote some files" is not the same claim as "Chrome accepts this
# extension". A manifest can be well-formed JSON, pass typecheck, and still be
# rejected for a bad permission, a missing file, or a CSP Chrome refuses. The
# only way to know is to load it.
#
# Run:  python packages/extension/scripts/verify-loads.py
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BUILD = Path(__file__).resolve().parent.parent / 'build'

REQUIRED = ['manifest.json', 'content.js', 'service-worker.js',
            'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png']

missing = [f for f in REQUIRED if not (BUILD / f).is_file()]
if missing:
    print(f'FAIL: build output missing {missing}')
    sys.exit(1)
print(f'build directory OK: {BUILD}')

errors = []
with sync_playwright() as p:
    # Extensions require a persistent context and a headed browser.
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
    )
    try:
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

        # The service worker registering is proof the manifest parsed, the
        # background entry resolved, and the module evaluated without throwing.
        worker = None
        for existing in ctx.service_workers:
            worker = existing
        if worker is None:
            try:
                worker = ctx.wait_for_event('serviceworker', timeout=20_000)
            except Exception:
                errors.append('no service worker registered within 20s')

        if worker is not None:
            print(f'service worker registered: {worker.url}')
            ext_id = worker.url.split('/')[2]
            print(f'extension id: {ext_id}')

            # Read the manifest back through the extension origin: this is
            # Chrome's own parsed copy, so agreement proves Chrome accepted the
            # fields rather than merely tolerating the file.
            got = worker.evaluate('chrome.runtime.getManifest()')
            print(f"name={got['name']} version={got['version']} mv={got['manifest_version']}")
            print(f"host_permissions={got['host_permissions']}")
            print(f"permissions={got.get('permissions')}")
            if got['manifest_version'] != 3:
                errors.append('not manifest v3')
            if sorted(got['host_permissions']) != sorted([
                'https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*']):
                errors.append(f"host_permissions changed: {got['host_permissions']}")
            if got.get('permissions') != ['storage']:
                errors.append(f"permissions is not exactly ['storage']: {got.get('permissions')}")

            # SPEC's zero-network claim: nothing in the package may name a
            # remote origin. Checked against Chrome's parsed manifest, not the
            # source file.
            blob = str(got)
            for host in ('http://', 'https://'):
                for token in blob.split(host)[1:]:
                    origin = token.split('/')[0]
                    if origin not in ('chatgpt.com', 'claude.ai', 'gemini.google.com'):
                        errors.append(f'unexpected remote origin in manifest: {origin}')
    finally:
        ctx.close()

if errors:
    print('\nFAIL:')
    for e in errors:
        print(f'  - {e}')
    sys.exit(1)
print('\nPASS: the built extension loads and Chrome accepts the manifest as written.')
