"""Open a browser profile for YOU to log into. Nothing here handles a password.

D43a's remaining half needs a logged-in session on claude.ai and chatgpt.com,
because their real composers - ProseMirror instances - are only reachable
behind a login, and a fixture snapshot cannot answer whether those editors
ACCEPT the masked write and keep it.

HOW THIS AVOIDS TOUCHING YOUR CREDENTIALS. This script opens an ordinary
browser window against a dedicated profile directory and then waits. You log
in, by hand, in that window. The credentials go from you to the site; they are
never typed by a script, never passed as an argument, never written to a file
in this repository, and never appear in any transcript. What persists is the
session cookie inside the profile directory, which is gitignored.

THE EXTENSION IS DELIBERATELY NOT LOADED HERE. A login form is the last place
to introduce an extension that watches composers, and keeping it out means the
profile you create is an ordinary logged-in browser rather than one that has
already been instrumented.

Run:  python packages/extension/scripts/login-profile.py
Then: python packages/extension/scripts/verify-live-site.py --profile --sites claude,chatgpt
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / '.live-profile'

SITES = [
    ('claude', 'https://claude.ai/new'),
    ('chatgpt', 'https://chatgpt.com/'),
    # Added at M13: the isComposing question has to be settled on all three,
    # and there is no reason to assume they behave alike.
    ('gemini', 'https://gemini.google.com/app'),
]

# Written by whoever drives this script once the human confirms. Polled below,
# so the session can be saved on a signal rather than only on a keypress this
# process may have no way to receive.
DONE_SENTINEL = PROFILE / '.logged-in'

PROFILE.mkdir(parents=True, exist_ok=True)
print(f'profile directory: {PROFILE}')
print('(gitignored - it holds session cookies and nothing this repo reads)\n')

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE),
        channel='msedge',
        headless=False,
        viewport={'width': 1360, 'height': 950},
        args=['--start-maximized'],
    )
    try:
        for name, url in SITES:
            page = ctx.new_page()
            page.goto(url, wait_until='domcontentloaded')
            print(f'  opened {name}: {url}')

        print('\n' + '=' * 68)
        print('LOG IN to all three tabs now, and open a NEW CHAT on each so the')
        print('real composer is on screen.')
        print()
        print('NOTE: probe-ime-live.py --control DELIBERATELY SENDS one short')
        print('message per site. That is the control step - "nothing was sent"')
        print('means nothing unless a plain Enter is shown to send in the same')
        print('run. The text is a greeting. Older text here claimed nothing is')
        print('ever sent; that was true of verify-live-site.py and is not true')
        print('of the IME probe.')
        print()
        print('When all three are logged in, CLOSE THE BROWSER WINDOW (that flushes')
        print('the session to disk), then press Enter here if this is interactive.')
        print('=' * 68)
        try:
            input()
        except EOFError:
            # No interactive stdin - this is being run detached by an agent,
            # which cannot press Enter here. Two exits instead: a sentinel file,
            # or the human simply closing the browser window.
            print()
            print('No interactive stdin (running detached).')
            print('Finish by closing the browser window, or by creating:')
            print(f'  {DONE_SENTINEL}')
            DONE_SENTINEL.unlink(missing_ok=True)
            waited = 0
            while waited < 3_600_000:
                if DONE_SENTINEL.exists():
                    print('sentinel seen - saving the session.')
                    DONE_SENTINEL.unlink(missing_ok=True)
                    break
                if not ctx.pages:
                    print('browser closed - saving the session.')
                    break
                try:
                    page.wait_for_timeout(2_000)
                except Exception:
                    print('browser closed - saving the session.')
                    break
                waited += 2_000
    finally:
        ctx.close()

print(f'\nSession saved to {PROFILE}')
print('Next: python packages/extension/scripts/probe-ime-live.py --control')
