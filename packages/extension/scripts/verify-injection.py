# Does the content script actually inject on a matched origin?
#
# The question this answers came from a real observation: the extension was
# loaded unpacked on a live signed-in claude.ai chat, active, no errors, and the
# console showed NOTHING from the extension at any log level. Two explanations
# fit that, and they need completely different fixes:
#
#   (a) the content script is not injecting at all;
#   (b) it is injecting and producing no observable output.
#
# Guessing between them is exactly the kind of thing this project does not do,
# so this measures it.
#
# HOW IT AVOIDS THE BOT WALL. All three target sites run bot detection, and an
# automated browser cannot get past it. But the question here is not "what does
# claude.ai look like" - it is "does Chrome inject our content script into a
# page served from the claude.ai ORIGIN". So the origin is intercepted and a
# committed fixture is served in its place. Chrome's matching is on the URL, so
# injection behaves identically; nothing about the real site is involved.
#
# Run: python packages/extension/scripts/verify-injection.py
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
FIXTURE = ROOT / 'test' / 'fixtures' / 'claude' / 'composer.html'

if not (BUILD / 'content.js').is_file():
    print(f'FAIL: no build at {BUILD}. Run: npm run build --workspace @privacyshield/extension')
    sys.exit(1)

fixture_html = FIXTURE.read_text(encoding='utf-8')

console_lines: list[str] = []
errors: list[str] = []

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
    )
    try:
        # Wait for the service worker so the extension is definitely loaded.
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event(
            'serviceworker', timeout=20_000
        )
        ext_id = worker.url.split('/')[2]
        print(f'extension loaded: {ext_id}')

        # INSTRUMENT THE RUNNING SERVICE WORKER, do not modify the artifact.
        # Adding a marker to the extension source would change the very thing
        # being measured. Attaching a listener to the already-loaded service
        # worker is observation, like a debugger breakpoint - the shipped code
        # is byte-for-byte what a user would run.
        worker.evaluate("""() => {
            globalThis.__PS_SEEN__ = [];
            chrome.runtime.onMessage.addListener((message, sender) => {
                globalThis.__PS_SEEN__.push({
                    kind: message && message.kind,
                    ok: message && message.ok,
                    failures: message && message.failures,
                    fromTab: !!(sender && sender.tab)
                });
            });
        }""")

        page = ctx.new_page()
        page.on('console', lambda m: console_lines.append(f'[{m.type}] {m.text}'))
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

        # Serve the fixture AT the claude.ai origin, so Chrome's content-script
        # matching sees the real URL pattern.
        page.route(
            'https://claude.ai/**',
            lambda route: route.fulfill(status=200, content_type='text/html', body=fixture_html),
        )
        page.goto('https://claude.ai/chat/injection-probe', wait_until='domcontentloaded')
        # content_scripts run_at is document_idle.
        page.wait_for_timeout(4000)

        heard = worker.evaluate('() => globalThis.__PS_SEEN__ || null')

        # Second case: a page with NO composer. If the content script is
        # running, health must FAIL and the badge must change - which is the
        # only thing the current build makes visible to anyone.
        page2 = ctx.new_page()
        page2.on('console', lambda m: console_lines.append(f'[no-composer {m.type}] {m.text}'))
        page2.route(
            'https://claude.ai/**',
            lambda route: route.fulfill(
                status=200, content_type='text/html',
                body='<!doctype html><html><body><div>no composer here</div></body></html>'),
        )
        page2.goto('https://claude.ai/chat/no-composer', wait_until='domcontentloaded')
        page2.wait_for_timeout(4000)
        page2.on('console', lambda m: console_lines.append(f'[p2 {m.type}] {m.text}'))
        heard_after = worker.evaluate('() => globalThis.__PS_SEEN__ || null')
        badge = worker.evaluate("""async () => {
            const tabs = await chrome.tabs.query({});
            const out = [];
            for (const t of tabs) {
                out.push({
                    url: (t.url || '').slice(0, 60),
                    badge: await chrome.action.getBadgeText({ tabId: t.id }),
                    title: await chrome.action.getTitle({ tabId: t.id })
                });
            }
            return out;
        }""")

        print()
        print('=' * 68)
        print(f'console output from the page (ANY source): {len(console_lines)} lines')
        for line in console_lines[:15]:
            print(f'   {line}')
        print()
        print(f'messages the service worker received: {heard_after}')
        print()
        print('per-tab action state:')
        for row in badge or []:
            print(f'   {row}')
        print(f'page errors: {errors or "none"}')
        print('=' * 68)
    finally:
        ctx.close()

# Deliberately no pass/fail exit code: this script reports what it observed and
# the reading is the point. A green tick here would invite exactly the
# over-reading this whole exercise is correcting.
print()
print('Interpretation guide:')
print('  messages received + no console lines -> INJECTING, SILENT BY DESIGN')
print('  no messages at all                   -> NOT INJECTING')
