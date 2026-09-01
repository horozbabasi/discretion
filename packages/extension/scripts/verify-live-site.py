"""LIVE SITE verification, against each site's REAL editor rather than a fixture.

D43a. Every earlier confirmation was against committed fixtures, which are
snapshots of DOM, not of ProseMirror or Quill. An editor that ACCEPTS a write
and reverts it on its next reconciliation looks identical in a fixture and
would silently un-mask a message in production. Only a real editor answers it.

Also exercised, because the same panel is how the write is reached without
sending: D29's confirmation for a composer filled by something other than
typing - a restored draft, a URL prefill, a suggestion chip.

  gemini    real Quill, reachable WITHOUT login
  claude    real ProseMirror, needs a logged-in profile
  chatgpt   real ProseMirror, needs a logged-in profile

NOTHING IS SENT. Before the one step that could submit, every POST is aborted
at the network layer, and the run reports how many it blocked. The value used
is a synthetic IBAN.

A site that cannot be reached is SKIPPED and reported as skipped, never as
passed - a run that quietly covers one site and prints success is exactly the
kind of check this project keeps finding.

Run:  python packages/extension/scripts/verify-live-site.py
      python packages/extension/scripts/verify-live-site.py --profile --sites claude,chatgpt

`--profile` reuses the session created by `login-profile.py`, which never
handles a password: you log in by hand and it keeps the cookie.
"""

import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
PROFILE = ROOT / '.live-profile'

SITES = {
    'gemini': {
        'url': 'https://gemini.google.com/app',
        'composer': 'div.ql-editor[role="textbox"]',
        'editor': 'Quill',
        'needs_login': False,
    },
    'claude': {
        'url': 'https://claude.ai/new',
        'composer': 'div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]',
        'editor': 'ProseMirror',
        'needs_login': True,
    },
    'chatgpt': {
        'url': 'https://chatgpt.com/',
        'composer': 'div.ProseMirror[contenteditable="true"], #prompt-textarea',
        'editor': 'ProseMirror',
        'needs_login': True,
    },
}

IBAN = 'GB33BUKB20201555555555'
MESSAGE = f'please wire it to {IBAN} today'

USE_PROFILE = '--profile' in sys.argv
requested = 'gemini'
for i, arg in enumerate(sys.argv):
    if arg == '--sites' and i + 1 < len(sys.argv):
        requested = sys.argv[i + 1]
SELECTED = [s.strip() for s in requested.split(',') if s.strip() in SITES]

FAILURES = []
SKIPPED = []
PASSED = []


def fail(site, message):
    print(f'  FAIL [{site}] {message}')
    FAILURES.append(f'{site}: {message}')


def skip(site, message):
    print(f'  SKIP [{site}] {message}')
    SKIPPED.append(f'{site}: {message}')


def ok(message):
    print(f'  ok: {message}')


def state_of(host):
    try:
        return host.get_attribute('data-state')
    except Exception:
        return None


def wait_for_state(page, host, wanted, timeout_s=150):
    deadline = time.time() + timeout_s
    seen = None
    while time.time() < deadline:
        seen = state_of(host)
        if seen == wanted:
            return seen
        page.wait_for_timeout(500)
    return seen


def read_composer(composer):
    return composer.evaluate('el => el.value !== undefined ? el.value : el.innerText')


def verify(ctx, site, config):
    print(f'\n=== {site} ({config["editor"]}) ===')
    page = ctx.new_page()
    try:
        page.goto(config['url'], wait_until='domcontentloaded')
        page.wait_for_timeout(9000)

        composer = page.locator(config['composer']).first
        try:
            composer.wait_for(state='attached', timeout=45_000)
        except Exception:
            if config['needs_login']:
                skip(site, f'no composer at {page.url[:70]} - not logged in, or a bot challenge')
            else:
                fail(site, f'no composer at {page.url[:70]}')
            return

        host = page.locator('privacyshield-surface')
        try:
            # state='attached': the host starts display:none, and the default
            # wait is for VISIBLE - which times out on an extension that has
            # attached perfectly well.
            host.wait_for(state='attached', timeout=30_000)
        except Exception:
            fail(site, 'the extension did not attach to this page')
            return
        ok('the extension attached')

        # D29 first, because its panel is also how the write is reached without
        # sending. Exactly what a restored draft or a suggestion chip does: the
        # text appears with NO editing event, so the input witness never sees
        # it and the pre-D47 code refused the send outright.
        page.evaluate(
            """([sel, text]) => {
              const el = document.querySelector(sel);
              if (el.value !== undefined) { el.value = text; return; }
              el.innerHTML = '<p>' + text + '</p>';
            }""",
            [config['composer'], MESSAGE],
        )
        page.wait_for_timeout(1500)
        composer.click()
        page.keyboard.press('Enter')

        state = wait_for_state(page, host, 'review', timeout_s=150)
        page.screenshot(path=str(BUILD / f'live-{site}-1-ask.png'))
        if state != 'review':
            fail(site, f'a prefilled composer did not produce the confirmation (state={state!r})')
            return
        ok('D29: the prefilled send was INTERCEPTED and asks instead of refusing')

        before = read_composer(composer)
        if IBAN not in before:
            fail(site, f'the composer lost the prefilled text: {before[:100]!r}')
            return
        ok('nothing sent yet; the original is still in the composer')

        # NOTHING MAY LEAVE. Confirming replays the user's own Enter, which on
        # a logged-in page would submit. Every POST is aborted first, so the
        # write is exercised while a message remains unable to reach anyone.
        posted = []

        def block_posts(route):
            if route.request.method == 'POST':
                posted.append(route.request.url[:100])
                route.abort()
            else:
                route.continue_()

        ctx.route('**', block_posts)
        try:
            box = host.bounding_box()
            if box is None:
                fail(site, 'the panel has no box')
                return
            # "Protect and send" is the primary action, last in the actions row.
            page.mouse.click(box['x'] + box['width'] - 62, box['y'] + box['height'] - 22)
            page.wait_for_timeout(3500)

            after = read_composer(composer)
            page.screenshot(path=str(BUILD / f'live-{site}-2-masked.png'))
            if IBAN in after:
                fail(site, f'the ORIGINAL survived the write: {after[:120]!r}')
                return
            if not re.search(r'[A-Z]{2}\d{2}[A-Z0-9]{10,}', after):
                fail(site, f'no surrogate in the composer after confirming: {after[:120]!r}')
                return
            ok(f'real {config["editor"]} ACCEPTED the write: {after.strip()[:80]!r}')

            # THE QUESTION A FIXTURE CANNOT ANSWER: an editor that accepts a
            # write and reverts it on its next reconciliation looks identical
            # in a snapshot and silently un-masks a message in production.
            page.wait_for_timeout(7000)
            settled = read_composer(composer)
            if IBAN in settled:
                fail(site, f'the ORIGINAL came back after reconciliation: {settled[:120]!r}')
            elif settled.strip() != after.strip():
                fail(site, f'the editor rewrote the masked text: {settled[:120]!r}')
            else:
                ok(f'and it SURVIVED 7s of {config["editor"]} reconciliation')
                PASSED.append(site)
            page.screenshot(path=str(BUILD / f'live-{site}-3-settled.png'))
            print(f'  POSTs blocked during the confirm step: {len(posted)}')
        finally:
            ctx.unroute('**', block_posts)
    finally:
        page.close()


if USE_PROFILE and not PROFILE.is_dir():
    print(f'no profile at {PROFILE}')
    print('Run: python packages/extension/scripts/login-profile.py')
    sys.exit(1)

print(f'sites: {", ".join(SELECTED)}')
print(f'profile: {PROFILE if USE_PROFILE else "(fresh, no login)"}')

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE) if USE_PROFILE else '',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        viewport={'width': 1360, 'height': 950},
    )
    try:
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event(
            'serviceworker', timeout=30_000)
        print(f'extension loaded: {worker.url.split("/")[2]}')
        for site in SELECTED:
            verify(ctx, site, SITES[site])
    finally:
        ctx.close()

print()
for line in SKIPPED:
    print(f'SKIPPED - {line}')
if FAILURES:
    print('\nFAILED:')
    for line in FAILURES:
        print(f'  - {line}')
    sys.exit(1)
print(f'\nVERIFIED against a real editor: {", ".join(PASSED) if PASSED else "(none)"}')
if SKIPPED:
    print('The skipped sites are NOT verified and remain open.')
    sys.exit(2)
