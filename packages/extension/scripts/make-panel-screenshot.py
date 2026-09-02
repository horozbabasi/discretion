"""Screenshots the review panel, for the Chrome Web Store listing.

─────────────────────────────────────────────────────────────────────────────
WHAT THIS DELIBERATELY DOES NOT DO

The store listing wants "the review panel on a real site". This script does NOT
produce that, and the difference matters.

To make the content script activate, the page has to be served from one of the
three matched origins, which every other harness in this repo does by
intercepting the origin and serving a committed fixture. A full-page screenshot
taken that way would show a browser at `chatgpt.com` displaying a page that is
not ChatGPT. Published in a store listing, that is a fabricated record of the
product running somewhere it was not - regardless of the fact that the PANEL in
it is completely genuine.

So the capture is cropped to the panel's own bounding box. No page content, no
URL bar, no site chrome. What the image shows is exactly what it claims: the
extension's review panel, rendering real detections from the real engine.

A screenshot of the panel over an actual signed-in conversation still has to be
taken by a person with an account. It cannot be automated, and it must not be
faked.
─────────────────────────────────────────────────────────────────────────────

Usage:
  python packages/extension/scripts/make-panel-screenshot.py
"""

from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
FIXTURE = ROOT / "test" / "fixtures" / "chatgpt" / "composer-contenteditable.html"
OUT = ROOT / "store-assets"

# Values chosen so the panel shows several DIFFERENT entity families at once -
# a credential, a payment instrument and a bank account - because a panel
# listing three of the same thing under-represents what the reader is choosing
# between. All three are generated, not real.
MESSAGE = (
    "Here is the failing request. The key is "
    "sk_live_7f3Kq2mNpX8vC1bWzR4tY6, the customer card is "
    "5555341244441115 and the refund account is DE44500105175407324931. "
    "Can you see why the charge is rejected?"
)


def main() -> int:
    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    profile = Path(tempfile.mkdtemp(prefix="ps-panel-"))
    fixture_html = FIXTURE.read_text(encoding="utf-8")
    failures: list[str] = []

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            channel="msedge",
            headless=False,
            args=[
                f"--disable-extensions-except={BUILD}",
                f"--load-extension={BUILD}",
                "--force-device-scale-factor=2",  # a crisp store image
            ],
            viewport={"width": 1000, "height": 820},
        )

        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=20_000)
        print(f"  extension: {re.sub(r'^chrome-extension://([a-z]+)/.*$', r'1', worker.url)}")

        page = context.new_page()
        page.on("console", lambda m: print(f"    console[{m.type}] {m.text[:160]}"))
        page.on("pageerror", lambda e: print(f"    pageerror: {str(e)[:160]}"))
        page.route(
            "https://chatgpt.com/**",
            lambda route: route.fulfill(
                status=200, content_type="text/html", body=fixture_html
            ),
        )
        page.goto("https://chatgpt.com/")
        page.wait_for_load_state("networkidle")

        composer = page.locator("[contenteditable='true']").first
        composer.click()
        composer.type(MESSAGE, delay=4)

        # The model has to load before the panel can show Stage 2 findings, and
        # it is slow from cold. Waiting on the panel itself rather than on a
        # fixed timeout: M10 learned that a 4s wait raced a 6.5s cold load and
        # gave different answers on identical code.
        page.keyboard.press("Enter")
        try:
            # Wait for the panel to be VISIBLE, not merely to exist. The host
            # element is created at initialisation and sits at display:none in
            # its hidden state, so waiting on its existence returns instantly
            # and every later assertion measures a zero-sized box - which is
            # exactly what the first version of this script did.
            page.wait_for_function(
                "() => { const h = document.querySelector('discretion-surface');"
                " return h !== null && h.getAttribute('data-state') === 'review'"
                " && h.getBoundingClientRect().height > 80; }",
                timeout=60_000,
            )
        except Exception:
            state = page.evaluate(
                "() => { const h = document.querySelector('discretion-surface');"
                " return h ? h.getAttribute('data-state') : 'no host'; }"
            )
            failures.append(f"the review panel never opened (data-state={state!r})")

        host = page.locator("discretion-surface")
        page.wait_for_timeout(1_200)  # let the entry transition settle

        state = page.evaluate(
            "() => { const h = document.querySelector('discretion-surface');"
            " if (!h) return 'no host';"
            " const cs = getComputedStyle(h);"
            " return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity,"
            " rect: h.getBoundingClientRect().toJSON(), attrs: [...h.attributes].map(a => a.name) }; }"
        )
        print(f"  surface state: {state}")
        box = host.bounding_box() if host.count() > 0 else None
        if box is None or box["width"] < 100 or box["height"] < 80:
            failures.append(f"the panel has no usable bounding box: {box}")
        else:
            # CROPPED TO THE PANEL. See the header: a full-page capture here
            # would depict the product running on a site it was not running on.
            path = OUT / "review-panel.png"
            page.screenshot(path=str(path), clip=box)
            print(f"  wrote {path.name}  ({int(box['width'])}x{int(box['height'])} CSS px, 2x)")

        context.close()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("Panel captured. NOT a substitute for a screenshot on a signed-in")
    print("conversation, which a person with an account still has to take.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
