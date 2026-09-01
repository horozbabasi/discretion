"""END-TO-END, ALL THREE ADAPTERS: does the sensitive value actually get
masked before it leaves the composer?

The one behaviour the milestone is for, confirmed in a real browser against the
shipped package, with the real offscreen document and the real model.

WHY THE ORIGIN IS REAL AND THE PAGE IS NOT. The content script is declared for
exactly three origins, so a localhost fixture would never be injected - and
adding a localhost match to verify would mean verifying a manifest that is not
the one that ships. Instead the ORIGIN is kept and the RESPONSE is replaced:
Playwright fulfils every path on the origin from the committed fixture. Chrome
sees the real origin, injects the shipped content script, and everything
downstream is production code.

ALL THREE SITES, because the write path they share is what was fixed (D43).
Verifying only the site the defect was found on would establish nothing about
the other two.

WHAT THIS ESTABLISHES: that the gate intercepts a real trusted Enter, that
detection runs through the offscreen document, that the review panel appears
and blocks, that confirming writes the masked text back into a real editable,
and that what the page's own send handler receives carries the surrogate and
not the original.

WHAT IT DOES NOT: that each site's real editor - ProseMirror, Quill - accepts
the write and does not revert it on its next reconciliation. The fixtures are
snapshots of their DOM, not their editors. That remains a live-site check, and
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
FIXTURES = ROOT / 'test' / 'fixtures'

SITES = [
    ('claude', 'https://claude.ai/**', 'https://claude.ai/chat/0123456789abcdef',
     'claude/composer.html'),
    ('chatgpt', 'https://chatgpt.com/**', 'https://chatgpt.com/c/0123456789abcdef',
     'chatgpt/composer-contenteditable.html'),
    ('gemini', 'https://gemini.google.com/**', 'https://gemini.google.com/app/0123456789abcdef',
     'gemini/composer.html'),
]

# Valid by construction and NOT a reserved documentation value - the
# distinction that once made a whole test file assert against an empty set.
IBAN = 'GB33BUKB20201555555555'
MESSAGE = f'please wire it to {IBAN} today'

# The page's own send handler, in the BUBBLE phase where a real one lives.
# Records what it WOULD have sent, so a leak is observable rather than inferred.
PAGE_SCRIPT = """
<script>
  window.__SENT__ = [];
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const c = document.querySelector('[contenteditable="true"], textarea');
      window.__SENT__.push(c ? (c.value !== undefined ? c.value : c.innerText) : '');
    }
  });
</script>
"""

FAILURES = []


def fail(site, message):
    print(f'  FAIL [{site}] {message}')
    FAILURES.append(f'{site}: {message}')


def wait_for_state(page, host, wanted, timeout_s=120):
    """Polls the panel's state. The first analysis waits on the model load."""
    deadline = time.time() + timeout_s
    seen = None
    while time.time() < deadline:
        try:
            seen = host.get_attribute('data-state')
        except Exception:
            seen = None
        if seen == wanted:
            return seen
        page.wait_for_timeout(500)
    return seen


def body_for(fixture_name):
    html = (FIXTURES / fixture_name).read_text(encoding='utf-8')
    if '</body>' in html:
        return html.replace('</body>', PAGE_SCRIPT + '</body>')
    return html + PAGE_SCRIPT


def state_of(host):
    try:
        return host.get_attribute('data-state')
    except Exception:
        return None


def verify(ctx, site, glob, url, fixture_name):
    print(f'\n=== {site} ===')
    page = ctx.new_page()
    page.on('pageerror', lambda e: print(f'  [pageerror] {str(e)[:160]}'))
    ctx.route(glob, lambda route: route.fulfill(
        status=200, content_type='text/html; charset=utf-8', body=body_for(fixture_name)))
    try:
        page.goto(url, wait_until='domcontentloaded')

        composer = page.locator('[contenteditable="true"], textarea').first
        composer.click()
        # Typed, not assigned: an assigned value is exactly what the input
        # witness (D26 construction #3) is built to reject.
        composer.type(MESSAGE, delay=12)

        host = page.locator('privacyshield-surface')
        if wait_for_state(page, host, 'findings') != 'findings':
            fail(site, f'no findings panel while typing (state={state_of(host)!r})')
            return

        page.keyboard.press('Enter')
        state = wait_for_state(page, host, 'review', timeout_s=60)
        sent_before = page.evaluate('window.__SENT__')
        if state != 'review':
            fail(site, f'the send was not blocked by a review panel (state={state!r})')
            return
        if sent_before:
            fail(site, f'THE PAGE RECEIVED THE SEND BEFORE REVIEW: {sent_before!r}')
            return
        print('  intercepted: review panel open, page handler fired 0 times')

        # The shadow root is CLOSED - that is the point of it - so the panel is
        # driven the way a user drives it: a real click at real coordinates.
        # "Mask and send" is the primary action, last in the actions row.
        box = host.bounding_box()
        if box is None:
            fail(site, 'the panel host has no box')
            return
        page.mouse.click(box['x'] + box['width'] - 62, box['y'] + box['height'] - 22)
        page.wait_for_timeout(4000)

        after = composer.evaluate('el => el.value !== undefined ? el.value : el.innerText')
        sent = page.evaluate('window.__SENT__')
        page.screenshot(path=str(BUILD / f'verify-{site}.png'))

        if IBAN in after:
            fail(site, 'the ORIGINAL is still in the composer after confirming')
            return
        if not re.search(r'[A-Z]{2}\d{2}[A-Z0-9]{10,}', after):
            fail(site, f'no surrogate in the composer: {after!r}')
            return
        if not sent:
            fail(site, f'masked but NOT RELEASED; state={state_of(host)!r}')
            return
        for payload in sent:
            if IBAN in payload:
                fail(site, f'THE ORIGINAL LEFT THE COMPOSER: {payload!r}')
                return
        print(f'  masked and released: {sent[-1]!r}')
    finally:
        ctx.unroute(glob)
        page.close()


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        viewport={'width': 1280, 'height': 900},
    )
    try:
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event(
            'serviceworker', timeout=30_000)
        print(f'extension loaded: {worker.url.split("/")[2]}')

        for site, glob, url, fixture_name in SITES:
            verify(ctx, site, glob, url, fixture_name)
    finally:
        ctx.close()

print()
if FAILURES:
    print('FAILED:')
    for line in FAILURES:
        print(f'  - {line}')
    sys.exit(1)
print(f'PASS on all {len(SITES)} adapters: {IBAN} never reached the page.')
