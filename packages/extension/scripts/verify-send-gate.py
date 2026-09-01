"""END-TO-END: does a sensitive value actually get masked before it leaves?

The one behaviour the milestone is for, confirmed in a real browser against the
real extension package, with the real offscreen document loading the real
280 MB model.

WHY THE ORIGIN IS REAL AND THE PAGE IS NOT. The content script is declared for
exactly three origins, so a localhost fixture would never be injected - and
adding a localhost match to verify would mean verifying a manifest that is not
the one that ships. Instead the ORIGIN is kept and the RESPONSE is replaced:
Playwright fulfils https://claude.ai/* from the committed fixture. Chrome sees
the real origin, injects the shipped content script, and everything downstream
is production code.

WHAT THIS ESTABLISHES: that the gate intercepts a real trusted Enter, that
detection runs through the offscreen document, that the review panel appears,
that confirming writes the masked text back through execCommand into a real
contenteditable, and that what the page's own send handler receives contains
the surrogate and not the original.

WHAT IT DOES NOT: that claude.ai's actual ProseMirror instance accepts the
write and does not revert it on its next reconciliation. The fixture is a
snapshot of its DOM, not its editor. That remains a live-site check, and
ADAPTER-VERIFICATION.md is where its result belongs.

Run:  python packages/extension/scripts/verify-send-gate.py
"""

import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
FIXTURE = ROOT / 'test' / 'fixtures' / 'claude' / 'composer.html'

# A value that is valid by construction and is not a reserved documentation
# value - the distinction that made a whole test file assert against an empty
# set once already.
IBAN = 'GB33BUKB20201555555555'
MESSAGE = f'please wire it to {IBAN} today'

# The page's own send handler. Records what it WOULD have sent, so a leak is
# observable rather than inferred.
PAGE_SCRIPT = """
<script>
  window.__SENT__ = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const c = document.querySelector('[contenteditable="true"]');
      window.__SENT__.push(c ? c.innerText : '');
    }
  });
</script>
"""


def wait_for_state(page, host, wanted, timeout_s=90):
    """Polls the panel's state. The first analysis waits on the model load."""
    deadline = time.time() + timeout_s
    seen = None
    while time.time() < deadline:
        seen = host.get_attribute('data-state')
        if seen == wanted:
            return seen
        page.wait_for_timeout(500)
    return seen


def fail(message: str) -> None:
    print(f'\nFAIL: {message}')
    sys.exit(1)


body = FIXTURE.read_text(encoding='utf-8')
if '</body>' in body:
    body = body.replace('</body>', PAGE_SCRIPT + '</body>')
else:
    body += PAGE_SCRIPT

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        viewport={'width': 1280, 'height': 900},
    )
    try:
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=30_000)
        ext_id = worker.url.split('/')[2]
        print(f'extension loaded: {ext_id}')

        # Registered BEFORE the page exists, and as a GLOB. `re:` is a
        # selector prefix, not a route one, so the first attempt matched
        # nothing: the real site loaded and redirected to /login. Every path
        # on the origin is intercepted, so the run touches no network.
        ctx.route(
            'https://claude.ai/**',
            lambda route: route.fulfill(
                status=200, content_type='text/html; charset=utf-8', body=body
            ),
        )
        # Collect what the content script reports, through its OWN reporting
        # path rather than a debug hook added for the occasion.
        worker.evaluate(
            "globalThis.__REPORTS__ = [];"
            "chrome.runtime.onMessage.addListener((m) => { globalThis.__REPORTS__.push(m); });"
        )
        page = ctx.new_page()
        page.on('console', lambda m: print(f'  [{m.type}]', m.text[:200]))
        page.on('pageerror', lambda e: print('  [pageerror]', str(e)[:200]))
        page.goto('https://claude.ai/chat/0123456789abcdef', wait_until='domcontentloaded')
        print('fixture served at the real origin')

        # The offscreen document loads a 280 MB model. The gate REFUSES until
        # Stage 2 can run, so this wait is part of what is being verified: a
        # send before the model is ready must not go through unscanned.
        deadline = time.time() + 180
        ready = False
        while time.time() < deadline:
            has_doc = worker.evaluate('chrome.offscreen.hasDocument()')
            if has_doc:
                ready = True
                break
            time.sleep(1)
        print(f'offscreen document present: {ready}')

        composer = page.locator('[contenteditable="true"]').first
        composer.click()
        # Real typing: real trusted input events, so the input witness sees the
        # element and verifyBinding can pass. Typed rather than assigned,
        # because an assigned value is exactly what construction #3 rejects.
        composer.type(MESSAGE, delay=12)

        host = page.locator('privacyshield-surface')
        state = wait_for_state(page, host, 'findings')
        print(f'after typing, panel state: {state}')
        if state != 'findings':
            editables = page.evaluate(
                "Array.from(document.querySelectorAll('[contenteditable=\"true\"]'))"
                ".map(e => ({ text: e.innerText, role: e.getAttribute('role'), tid: e.getAttribute('data-testid') }))"
            )
            print('  composer text  :', repr(composer.inner_text()))
            print('  editables      :', editables)
            print('  host attrs     :', page.evaluate(
                "(() => { const h = document.querySelector('privacyshield-surface');"
                " return h ? Object.fromEntries(Array.from(h.attributes).map(a => [a.name, a.value])) : null; })()"
            ))
            fail(f'expected the findings panel while typing, got {state!r}')

        page.screenshot(path=str(ROOT / 'build' / 'verify-1-findings.png'))

        # ── the send ──
        page.keyboard.press('Enter')
        state = wait_for_state(page, host, 'review', timeout_s=60)

        sent_before = page.evaluate('window.__SENT__')
        print(f'after Enter, panel state: {state}; page send handler fired: {len(sent_before)}')
        if state != 'review':
            fail(f'expected the review panel to block the send, got {state!r}')
        page.screenshot(path=str(ROOT / 'build' / 'verify-2-review.png'))

        # ── confirm ──
        # The shadow root is CLOSED, so the panel cannot be scripted - which is
        # the point of it being closed. It is driven the way a user drives it:
        # a real click at real coordinates. "Mask and send" is the primary
        # action, last in the actions row, bottom-right of the panel.
        page.evaluate(
            "window.__KEYS__ = [];"
            "document.addEventListener('keydown', (e) => window.__KEYS__.push("
            "  { key: e.key, trusted: e.isTrusted, phase: 'capture', prevented: e.defaultPrevented }"
            "), true);"
        )
        box = host.bounding_box()
        if box is None:
            fail('the panel host has no box')
        page.mouse.click(box['x'] + box['width'] - 62, box['y'] + box['height'] - 22)
        page.wait_for_timeout(3000)

        after = composer.inner_text()
        sent = page.evaluate('window.__SENT__')
        print('keydowns seen by the page after confirm:', page.evaluate('window.__KEYS__'))
        print('panel state after confirm:', host.get_attribute('data-state'))
        print('extension reports:', worker.evaluate('globalThis.__REPORTS__'))
        print('panel text after confirm :', repr(page.evaluate(
            "(() => { const h = document.querySelector('privacyshield-surface');"
            " return h ? h.textContent : null; })()"
        )))
        page.screenshot(path=str(ROOT / 'build' / 'verify-3-after.png'))

        print('\n--- RESULT ---')
        print(f'composer after confirm : {after!r}')
        print(f'page received          : {sent!r}')

        if IBAN in after:
            fail('the ORIGINAL IBAN is still in the composer after confirming')
        if not re.search(r'[A-Z]{2}\d{2}[A-Z0-9]{10,}', after):
            fail(f'no surrogate IBAN in the composer; got {after!r}')
        if not sent:
            fail('the page never received the send: masked, but not released')
        for payload in sent:
            if IBAN in payload:
                fail(f'THE ORIGINAL LEFT THE COMPOSER: {payload!r}')

        print('\nPASS')
        print(f'  original  {IBAN}  never reached the page')
        print(f'  released  {sent[-1]!r}')
    finally:
        ctx.close()
