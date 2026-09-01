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
]

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
        print('LOG IN to both tabs now, and open a NEW CHAT on each so the real')
        print('composer is on screen.')
        print()
        print('Nothing will be sent to either service by the verification that')
        print('follows: it types a synthetic IBAN, lets the extension mask it,')
        print('and blocks every outbound POST before the step that would submit.')
        print()
        print('When both are logged in, press Enter HERE to save the session.')
        print('=' * 68)
        try:
            input()
        except EOFError:
            print('\nNo interactive stdin. Log in, then close the browser window.')
            page.wait_for_timeout(600_000)
    finally:
        ctx.close()

print(f'\nSession saved to {PROFILE}')
print('Next: python packages/extension/scripts/verify-live-site.py --profile --sites claude,chatgpt')
