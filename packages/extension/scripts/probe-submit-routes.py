"""Drives the four escape routes against the real extension, in a real browser.

WHY ROUTE INTERCEPTION RATHER THAN THE LIVE SITE. The question is what OUR
extension does when a send arrives by an unusual route. That needs the content
script to actually be running, which needs the page to be on one of the three
permitted origins — and it needs a composer, which chatgpt.com only renders for
a signed-in user.

So Playwright serves a controlled ChatGPT-shaped document AT https://chatgpt.com/.
The origin is real, so `host_permissions` matches, the content script runs, and
`siteAdapter()` resolves ChatGptAdapter by hostname. The DOM is ours, so the
composer strategies resolve deterministically and the "site's own send handler"
is a function this file writes and can vary.

WHAT THIS PROVES AND WHAT IT CANNOT. It settles what the EXTENSION does for
each route, with real browser event semantics — real `isComposing`, a real
capture-phase listener, a real `form.requestSubmit()`. It does NOT settle what
chatgpt.com's own handler does, because that handler is not present. Every
claim below is scoped to the extension's half, and the site's half is called
out as unverified wherever it matters.

POSITIVE CONTROL FIRST. If the extension is not actually running, every route
reports "not intercepted" and the run would `prove` four leaks that are really
one broken harness. So an ordinary Enter is tested first and the run ABORTS if
it is not intercepted.

Usage:
  python scripts/probe-submit-routes.py [--keep-open]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

SECRET = "GB33BUKB20201555555555"

# A ChatGPT-shaped composer: the id the adapter's strongest strategy keys on,
# inside the composer form, with a marked send button. Deliberately faithful to
# CHATGPT_COMPOSER_STRATEGIES so resolution is not the variable under test.
PAGE = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>probe</title></head>
<body>
  <main>
    <form data-type="unified-composer" id="composer-form">
      <div id="prompt-textarea" contenteditable="true" role="textbox">Pay {SECRET} today.</div>
      <button type="submit" data-testid="send-button" id="composer-submit-button">Send</button>
    </form>
    <div id="transcript"></div>
    <iframe name="sink" style="display:none"></iframe>
  </main>
  <script>
    // The "site". Records every send it performs so the probe can tell a send
    // that escaped from one that never happened.
    window.__sent = [];
    window.__send = (via) => {{
      const box = document.getElementById('prompt-textarea');
      window.__sent.push({{ via, text: box.textContent }});
      document.getElementById('transcript').textContent += '[' + via + ']';
    }};

    // How this page decides Enter is a send. `checkComposing` is flipped by the
    // probe to model both kinds of site: one that respects IME composition and
    // one that does not.
    window.__checkComposing = true;
    document.addEventListener('keydown', (e) => {{
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (window.__checkComposing && e.isComposing) return;
      window.__send('enter');
    }});

    document.getElementById('composer-form').addEventListener('submit', (e) => {{
      e.preventDefault();
      window.__send('form-submit-event');
    }});
  </script>
</body></html>"""


def fail(m: str) -> None:
    print(f"  FAIL  {m}")


def ok(m: str) -> None:
    print(f"  ok    {m}")


def note(m: str) -> None:
    print(f"  --    {m}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-open", action="store_true")
    args = parser.parse_args()

    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    failures: list[str] = []
    # KNOWN-OPEN routes are reported and do NOT fail the run; a route that was
    # closed and reopens DOES. Without the distinction this probe can only ever
    # exit 1 and stops being usable as a regression gate.
    known_open: list[str] = []
    profile = Path(tempfile.mkdtemp(prefix="ps-routes-"))

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            channel="msedge",
            headless=False,
            args=[f"--disable-extensions-except={BUILD}", f"--load-extension={BUILD}"],
        )
        # Serve our document AT the real origin, so host_permissions matches.
        context.route(
            "https://chatgpt.com/**",
            lambda route: route.fulfill(status=200, content_type="text/html", body=PAGE),
        )

        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=15_000)
        print(f"extension id: {re.sub(r'^chrome-extension://([a-z]+)/.*$', r'\\1', worker.url)}")

        page = context.new_page()
        page.goto("https://chatgpt.com/", wait_until="domcontentloaded")
        # The content script warms the offscreen model on load; give it room.
        page.wait_for_timeout(9000)

        def reset() -> None:
            page.evaluate(
                """() => {
                     window.__sent = [];
                     const box = document.getElementById('prompt-textarea');
                     box.textContent = 'Pay %s today.';
                     document.getElementById('transcript').textContent = '';
                   }"""
                % SECRET
            )
            # The gate needs to have SEEN the user type, or it refuses for a
            # different reason (no-input-witness) and the result is ambiguous.
            page.evaluate(
                """() => document.getElementById('prompt-textarea')
                       .dispatchEvent(new Event('input', {bubbles: true, composed: true}))"""
            )
            page.wait_for_timeout(700)

        def sent() -> list:
            return page.evaluate("() => window.__sent")

        def composer_text() -> str:
            return page.evaluate(
                "() => document.getElementById('prompt-textarea').textContent"
            )

        # ── POSITIVE CONTROL ──────────────────────────────────────────────
        print("\n== positive control: is the extension actually running? ==")
        reset()
        page.evaluate(
            """() => document.getElementById('prompt-textarea').dispatchEvent(
                 new KeyboardEvent('keydown',
                   {key:'Enter', bubbles:true, composed:true, cancelable:true}))"""
        )
        page.wait_for_timeout(2500)
        control_sent = sent()
        if len(control_sent) > 0:
            failures.append(
                "POSITIVE CONTROL FAILED: a plain Enter reached the page's own handler. "
                "The extension is not intercepting, so every result below is meaningless."
            )
            fail(f"plain Enter was NOT intercepted; page sent {control_sent}")
            print("\nABORTING: without interception this probe cannot distinguish a")
            print("route that escapes from a harness that is not running.")
            context.close()
            return 1
        ok("a plain Enter is intercepted (the extension is live and gating)")

        # ── ROUTE 1: IME composition Enter ────────────────────────────────
        print("\n== route 1: Enter with isComposing = true ==")
        print("   Our side: does the extension skip it? (chatgpt.ts:262)")
        for site_checks in (True, False):
            reset()
            page.evaluate(f"() => {{ window.__checkComposing = {str(site_checks).lower()}; }}")
            page.evaluate(
                """() => document.getElementById('prompt-textarea').dispatchEvent(
                     new KeyboardEvent('keydown',
                       {key:'Enter', isComposing:true, bubbles:true, composed:true, cancelable:true}))"""
            )
            page.wait_for_timeout(2500)
            after = sent()
            label = "site DOES check isComposing" if site_checks else "site does NOT check"
            if len(after) == 0:
                note(f"{label}: nothing sent — no leak")
            else:
                leaked = any(SECRET in entry["text"] for entry in after)
                if leaked:
                    print(f"  LEAK  {label}: the page sent, carrying the ORIGINAL value")
                    if not site_checks:
                        note("      ^ this is the modelled hazard, reproduced")
                else:
                    note(f"{label}: page sent, but not the raw value")
        note("The extension skips a composing Enter unilaterally. Whether that is")
        note("safe depends on the SITE agreeing, which this harness models but")
        note("cannot observe on the real chatgpt.com (no composer without login).")

        # ── ROUTE 2: form.requestSubmit() ─────────────────────────────────
        print("\n== route 2: programmatic form.requestSubmit() ==")
        reset()
        page.evaluate("() => document.getElementById('composer-form').requestSubmit()")
        page.wait_for_timeout(2500)
        after = sent()
        if len(after) > 0 and any(SECRET in e["text"] for e in after):
            print(f"  LEAK  requestSubmit() reached the page with the ORIGINAL value")
            failures.append("REGRESSION: requestSubmit() is no longer intercepted")
        elif len(after) == 0:
            ok("requestSubmit() was intercepted")
        else:
            ok(f"requestSubmit() reached the page, but masked: {after[0]['text'][:60]!r}")

        # ── ROUTE 4: an unrecognised control ──────────────────────────────
        print("\n== route 4: a click on a control the selector does not match ==")
        reset()
        page.evaluate(
            """() => {
                 const b = document.createElement('button');
                 b.type = 'button';
                 b.id = 'mystery';
                 b.setAttribute('aria-label', 'Gonder');
                 b.addEventListener('click', () => window.__send('mystery-button'));
                 document.getElementById('composer-form').append(b);
               }"""
        )
        # dispatchEvent, not page.click(): a real click needs hit-testing, and
        # the extension's own findings panel sits over the composer once it has
        # detected something. That is a UI question; this route is about whether
        # the capture-phase LISTENER recognises the target, which a dispatched
        # click exercises identically — and identically to the other routes.
        page.evaluate(
            """() => document.getElementById('mystery').dispatchEvent(
                 new MouseEvent('click', {bubbles:true, composed:true, cancelable:true}))"""
        )
        page.wait_for_timeout(2500)
        after = sent()
        if len(after) > 0 and any(SECRET in e["text"] for e in after):
            print("  LEAK  an unrecognised control sent the ORIGINAL value")
            known_open.append("route 4: a click on an unrecognised control (site sends via JS)")
        elif len(after) == 0:
            ok("the unrecognised control was intercepted")
        else:
            ok("reached the page, but masked")

        # ── ROUTE 5: NO recognised send control exists at all ─────────────
        #
        # This is the actual D57 condition, and route 4 is not it. In route 4 a
        # working send button is present and the site chose to send from a
        # different control - the extension correctly concluded that click was
        # not the send. Here the send button is REMOVED, so nothing resolves,
        # and "not a send control" becomes indistinguishable from "a send
        # control we failed to recognise".
        #
        # Route 4 therefore doubles as the control for any fix aimed at this:
        # a fix must catch route 5 WITHOUT starting to catch route 4.
        print("\n== route 5: the send control cannot be resolved at all ==")
        reset()
        resolves = page.evaluate(
            """() => {
                 const b = document.getElementById('composer-submit-button');
                 if (b) b.remove();
                 const m = document.getElementById('mystery');
                 if (m) m.remove();
                 const n = document.createElement('button');
                 n.type = 'button';
                 n.id = 'only-control';
                 n.setAttribute('aria-label', 'Gonder');
                 n.addEventListener('click', () => window.__send('only-control'));
                 document.getElementById('composer-form').append(n);
                 return document.querySelectorAll(
                   'button[data-testid="send-button"], button[id="composer-submit-button"], '
                   + 'form[data-type="unified-composer"] button[type="submit"]').length;
               }"""
        )
        note(f"send controls now matching the adapter's selector: {resolves}")
        if resolves != 0:
            failures.append("route 5 setup failed: a send control still resolves")
            fail("the precondition for this route was not established")
        else:
            page.wait_for_timeout(900)
            page.evaluate(
                """() => document.getElementById('only-control').dispatchEvent(
                     new MouseEvent('click', {bubbles:true, composed:true, cancelable:true}))"""
            )
            page.wait_for_timeout(2500)
            after = sent()
            if len(after) > 0 and any(SECRET in e["text"] for e in after):
                print("  LEAK  the only control on the composer sent the ORIGINAL value")
                known_open.append(
                    "route 5: a click when no send control resolves (D57; the fix cannot key "
                    "on this state because it is also every moment a response is streaming)"
                )
            elif len(after) == 0:
                ok("intercepted, with no send control resolvable")
            else:
                ok("reached the page, but masked")

        # ── ROUTE 3: form.submit() ────────────────────────────────────────
        #
        # LAST, DELIBERATELY. A real form.submit() NAVIGATES, and the first
        # version of this probe ran it third — destroying the execution context
        # and taking route 4 down with it, which read as a route-4 failure.
        # Navigation is aimed at a hidden iframe as well, belt and braces.
        print("\n== route 3: programmatic form.submit() ==")
        print("   form.submit() fires NO submit event; no listener can see it.")
        reset()
        observed = page.evaluate(
            """() => {
                 let sawSubmit = false;
                 const form = document.getElementById('composer-form');
                 const spy = () => { sawSubmit = true; };
                 form.addEventListener('submit', spy, true);
                 form.target = 'sink';
                 form.action = 'about:blank';
                 try { HTMLFormElement.prototype.submit.call(form); } catch (e) { /* ignored */ }
                 form.removeEventListener('submit', spy, true);
                 return sawSubmit;
               }"""
        )
        if observed:
            note("a submit event WAS observed (unexpected; browsers do not fire one)")
        else:
            ok("no submit event fired — architecturally invisible to ANY listener")
            note("No listener-based fix can reach this. Only patching")
            note("HTMLFormElement.prototype.submit in the PAGE world could, which")
            note("needs script injection this extension deliberately cannot do.")

        print(f"\ncomposer now: {composer_text()[:70]!r}")

        if args.keep_open:
            page.wait_for_timeout(30000)
        context.close()

    print("\n" + "=" * 60)
    if failures:
        print(f"REGRESSIONS ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("No regression. Routes closed by the backstop are still closed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
