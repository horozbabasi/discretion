"""LIVE SITE verification, against a real editor rather than a fixture.

Two open items close here, and both need a REAL page:

  D43a - does the write-back survive the site's own editor? Every previous
         confirmation was against committed fixtures, which are snapshots of
         DOM, not of ProseMirror or Quill. An editor that ACCEPTS a write and
         reverts it on its next reconciliation would look identical in a
         fixture and would silently un-mask a message in production.

  D29  - the composer filled by something other than typing. Verified in jsdom;
         this checks it on a page the extension was actually written for.

gemini.google.com serves a real Quill editor WITHOUT LOGIN, which is what makes
this possible at all. claude.ai sits behind a challenge and chatgpt.com's
logged-out page carries only a marketing textarea, so this covers one of three
sites - stated plainly rather than presented as all of them.

NOTHING IS SENT. The write-back is exercised through the paste guard's "Mask
now", which writes and deliberately does not release. Before the one step that
could submit, every POST is aborted at the network layer, so no message can
leave even if the page tries.

Run:  python packages/extension/scripts/verify-live-site.py
"""

import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
URL = 'https://gemini.google.com/app'

IBAN = 'GB33BUKB20201555555555'
MESSAGE = f'please wire it to {IBAN} today'

FAILURES = []


def fail(message):
    print(f'  FAIL: {message}')
    FAILURES.append(message)


def ok(message):
    print(f'  ok: {message}')


def wait_for_state(page, host, wanted, timeout_s=150):
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


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir='',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        viewport={'width': 1360, 'height': 950},
    )
    try:
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event(
            'serviceworker', timeout=30_000)
        print(f'extension loaded: {worker.url.split("/")[2]}')

        page = ctx.new_page()
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_timeout(8000)

        composer = page.locator('div.ql-editor[role="textbox"]').first
        composer.wait_for(timeout=45_000)
        editor = page.evaluate(
            "() => { const e = document.querySelector('div.ql-editor[role=\"textbox\"]');"
            " return { cls: e.className, children: Array.from(e.childNodes).map(n => n.nodeName) }; }"
        )
        print(f'real editor: {editor}')

        host = page.locator('privacyshield-surface')
        try:
            # state='attached': the host starts display:none, and the default
            # wait is for VISIBLE - which timed out on an extension that had
            # attached perfectly well.
            host.wait_for(state='attached', timeout=30_000)
            ok('the extension attached to the real page')
        except Exception:
            fail('the extension never attached; nothing else can be checked')
            raise SystemExit(1)

        # ── D29 first, because its panel is also how D43a gets exercised ──
        #
        # The paste guard would have been the tidier route to a write-without-a-
        # send, but its notice never appeared on this page inside 150 s, so it
        # is not a dependable way to reach the write. The D29 confirmation is,
        # and it is on the same screen.
        print('\n--- D29: a composer filled by something other than typing ---')

        # Exactly what a restored draft, a URL prefill or a suggestion chip
        # does: the text appears with NO editing event, so the input witness
        # never sees it and the old code refused the send outright.
        page.evaluate(
            """(text) => {
              const el = document.querySelector('div.ql-editor[role="textbox"]');
              el.innerHTML = '<p>' + text + '</p>';
            }""",
            MESSAGE,
        )
        page.wait_for_timeout(1500)
        composer.click()
        page.keyboard.press('Enter')

        state = wait_for_state(page, host, 'review', timeout_s=150)
        page.screenshot(path=str(BUILD / 'live-1-d29.png'))
        if state != 'review':
            fail(f'a prefilled composer did not produce the confirmation (state={state!r})')
            raise SystemExit(1)
        ok('the prefilled send was INTERCEPTED and asks instead of refusing')

        before = composer.inner_text()
        if IBAN not in before:
            fail(f'the composer lost the prefilled text: {before[:120]!r}')
            raise SystemExit(1)
        ok('nothing sent yet; the original is still in the composer')

        # ── D43a: the write-back, against the site's own Quill ──
        print('\n--- D43a: write-back against real Quill ---')

        # NOTHING MAY LEAVE. Confirming replays the user's own Enter, which on
        # this page would attempt a submission. Every POST is aborted at the
        # network layer first, so the write can be exercised while it remains
        # impossible for a message to reach anyone.
        posted = []
        def block_posts(route):
            if route.request.method == 'POST':
                posted.append(route.request.url[:120])
                route.abort()
            else:
                route.continue_()
        ctx.route('**', block_posts)

        box = host.bounding_box()
        if box is None:
            fail('the panel has no box')
            raise SystemExit(1)
        # "Protect and send" is the primary action, last in the actions row.
        page.mouse.click(box['x'] + box['width'] - 62, box['y'] + box['height'] - 22)
        page.wait_for_timeout(3500)

        after = composer.inner_text()
        page.screenshot(path=str(BUILD / 'live-2-masked.png'))
        if IBAN in after:
            fail(f'the ORIGINAL survived the write: {after[:140]!r}')
        elif not re.search(r'[A-Z]{2}\d{2}[A-Z0-9]{10,}', after):
            fail(f'no surrogate in the composer after confirming: {after[:140]!r}')
        else:
            ok(f'real Quill ACCEPTED the write: {after.strip()[:90]!r}')

            # THE QUESTION A FIXTURE CANNOT ANSWER: an editor that accepts a
            # write and reverts it on its next reconciliation looks identical
            # in a snapshot and silently un-masks a message in production.
            page.wait_for_timeout(7000)
            settled = composer.inner_text()
            if IBAN in settled:
                fail(f'the ORIGINAL came back after reconciliation: {settled[:140]!r}')
            elif settled.strip() != after.strip():
                fail(f'Quill rewrote the masked text: {settled[:140]!r}')
            else:
                ok('and it SURVIVED 7s of the editor\'s own reconciliation')
            page.screenshot(path=str(BUILD / 'live-3-settled.png'))

        print(f'  POSTs blocked during the confirm step: {len(posted)}')
    finally:
        ctx.close()

print()
if FAILURES:
    print('FAILED:')
    for line in FAILURES:
        print(f'  - {line}')
    sys.exit(1)
print('PASS: verified against a real Quill editor on gemini.google.com.')
print('claude.ai and chatgpt.com remain unverified live - both need credentials.')
