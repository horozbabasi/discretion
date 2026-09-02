"""Does chatgpt.com itself send when Enter commits an IME candidate?

─────────────────────────────────────────────────────────────────────────────
THE LAST UNVERIFIED SEND ROUTE

Our side is settled: the adapter skips an Enter whose `isComposing` is true, so
Discretion does not gate that keystroke. That is only SAFE IF THE SITE ALSO
SKIPS IT. If ChatGPT submits on a composing Enter, a CJK user commits a
candidate and the message goes out ungated.

Every previous attempt to answer this used a page served by the harness, which
cannot answer it: route interception replaces the site's own script, and the
real handler exists only behind a login.

WHAT THIS DOES ABOUT CREDENTIALS. Nothing. It reuses `.live-profile`, the
profile YOU logged into by hand via login-profile.py. No password is typed,
read, stored or passed by any script here. If the session has expired, this
reports that and stops - it does not attempt to log in, and it does not try to
get past any challenge.

THE EXTENSION IS NOT LOADED. The question is what the SITE does. Loading the
extension would have it intercept the send and answer a different question.

WHY A GENUINE COMPOSITION IS POSSIBLE HERE. `Input.imeSetComposition` over CDP
puts the page into a real composition state: probe-ime-composition.py measured
`compositionstart` firing with `isTrusted: true` and a following Enter arriving
with `isComposing: true`, also trusted. A page-dispatched KeyboardEvent cannot
do this - it arrives untrusted - which is why the earlier synthetic attempts
could not settle the question. So no human at an IME is needed; only a
logged-in session is.

THIS CAN SEND A MESSAGE, AND THAT IS THE POINT. If the site does submit on a
composing Enter, a short harmless message appears in your ChatGPT history. The
control step below deliberately sends one more, because "nothing was sent"
means nothing unless a plain Enter is shown to send in the same run.
─────────────────────────────────────────────────────────────────────────────

Usage:
  python packages/extension/scripts/probe-ime-live.py [--control] [--site all]

  --site     chatgpt | claude | gemini | all   (default: all)
  --control  also press a plain Enter afterwards, to prove a send WOULD have
             been observable. Without it a negative result is not conclusive.

All three are asked, because there is no reason to assume they behave alike -
they do not agree on anything else about their composers.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
PROFILE = ROOT / ".live-profile"

# Deliberately innocuous, and deliberately Japanese: it is what an IME user
# would actually be typing, and it carries nothing sensitive. If it does get
# sent, what lands in the history is a greeting.
COMPOSITION_TEXT = "こんにちは"

# The signed-in composer for each site, and the marker that says the real app
# loaded rather than a marketing page. Selectors are lifted from the adapters
# in src/adapters/, so this probe and the extension agree about what a composer
# is; a probe with its own idea of the composer answers a different question.
SITES = {
    "chatgpt": {
        "url": "https://chatgpt.com/",
        "composer": ["#prompt-textarea", "[contenteditable='true'][role='textbox']"],
        "app_marker": "#prompt-textarea, [data-testid='send-button']",
    },
    "claude": {
        "url": "https://claude.ai/new",
        "composer": [
            "[contenteditable='true'][role='textbox']",
            "div.ProseMirror[contenteditable='true']",
        ],
        "app_marker": "[data-testid='chat-input'], div.ProseMirror[contenteditable='true']",
    },
    "gemini": {
        "url": "https://gemini.google.com/app",
        "composer": [".ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']"],
        "app_marker": ".ql-editor, [data-test-id='send-button'], .send-button",
    },
}


def session_state(page, site: dict) -> dict:
    """Signed in, or looking at the marketing page?

    THIS DISTINCTION IS LOAD-BEARING, and the first version of this script did
    not make it. Logged out, chatgpt.com still renders a `<textarea>` on its
    landing page. The script found it, composed into it, pressed Enter, saw
    nothing sent, and would have reported WAITS CORRECTLY - about a textarea
    with no send handler attached to it at all.

    Its own control step caught that: a plain Enter did not send either, it
    inserted a newline. Which is why the control exists.
    """
    return page.evaluate(
        """(marker) => {
          const loginish = [...document.querySelectorAll('a,button')]
            .map((e) => (e.textContent || '').trim())
            .filter((t) => /log ?in|sign ?in|sign ?up|get started/i.test(t));
          return {
            appLoaded: document.querySelector(marker) !== null,
            contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
            loginAffordances: [...new Set(loginish)].slice(0, 4),
          };
        }""",
        site["app_marker"],
    )


def composer_of(page, site: dict):
    """The signed-in app composer only. Never a landing-page textarea."""
    for selector in site["composer"]:
        found = page.locator(selector).first
        try:
            if found.count() > 0 and found.is_visible():
                return found, selector
        except Exception:
            continue
    return None, None


def probe_site(context, name: str, site: dict, control: bool) -> tuple[int, str]:
    """Returns (code, one-line verdict). 0 waits correctly, 1 defect, 3 inconclusive."""
    page = context.new_page()
    print()
    print("=" * 68)
    print(f"  {name}  ->  {site['url']}")
    print("=" * 68)

    try:
        page.goto(site["url"], wait_until="domcontentloaded", timeout=60_000)
    except Exception as error:
        print(f"  could not load: {error}")
        page.close()
        return 3, f"{name}: page would not load"
    page.wait_for_timeout(7_000)

    state = session_state(page, site)
    print(f"  session: {state}")
    composer, selector = composer_of(page, site)

    if not state["appLoaded"] or composer is None:
        print()
        print("  NOT SIGNED IN, or the app did not load its composer.")
        if state["loginAffordances"]:
            print(f"  the page offers: {state['loginAffordances']}")
        print("  Reported INCONCLUSIVE, not as a pass: a page with no send handler")
        print("  sends nothing, which is not evidence about anything.")
        page.close()
        return 3, f"{name}: not signed in"

    print(f"  composer: {selector}")
    composer.click()
    page.wait_for_timeout(600)

    page.evaluate(
        """(sel) => {
          const node = document.querySelector(sel);
          window.__ps = { enters: [], text: () =>
            (typeof node.value === 'string' ? node.value : (node.textContent ?? '')) };
          node.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') window.__ps.enters.push({
              isComposing: e.isComposing, keyCode: e.keyCode, trusted: e.isTrusted });
          }, true);
        }""",
        selector,
    )

    cdp = context.new_cdp_session(page)

    print()
    print("  -- composing Enter (the actual question) --")
    cdp.send(
        "Input.imeSetComposition",
        {
            "text": COMPOSITION_TEXT,
            "selectionStart": len(COMPOSITION_TEXT),
            "selectionEnd": len(COMPOSITION_TEXT),
        },
    )
    page.wait_for_timeout(600)
    before = page.evaluate("() => window.__ps.text()")
    print(f"  composer before Enter: {before!r}")

    for kind in ("rawKeyDown", "keyUp"):
        cdp.send(
            "Input.dispatchKeyEvent",
            {
                "type": kind,
                "key": "Enter",
                "code": "Enter",
                "windowsVirtualKeyCode": 13,
                "nativeVirtualKeyCode": 13,
            },
        )
    page.wait_for_timeout(3_000)

    after = page.evaluate("() => window.__ps.text()")
    enters = page.evaluate("() => window.__ps.enters")
    print(f"  composer after Enter : {after!r}")
    print(f"  Enter events seen    : {enters}")

    composing_seen = any(e["isComposing"] for e in enters)
    sent = len(before.strip()) > 0 and len(after.strip()) == 0

    print()
    if not composing_seen:
        print("  INCONCLUSIVE: no Enter arrived with isComposing=true, so the")
        print("  composition state never reached the handler for this page.")
        page.close()
        return 3, f"{name}: composition did not reach the handler"

    if sent:
        print("  *** SENDS PREMATURELY ***")
        print("  An Enter that only committed an IME candidate submitted the")
        print("  message. A CJK user can send ungated text.")
        page.close()
        return 1, f"{name}: SENDS PREMATURELY"

    print("  WAITS CORRECTLY: the composing Enter committed the candidate and")
    print("  did NOT submit.")

    if control:
        print()
        print("  -- control: a plain Enter, to show a send would have been visible --")
        print("     (this sends one short message to your account, on purpose)")

        # END THE COMPOSITION FIRST, and start the control from a clean line.
        #
        # The first version pressed Enter straight after the composing one and
        # the control FAILED on claude and gemini. The likely reason is that the
        # composition was still open, so the "plain" Enter was not plain at all
        # - it was a second composing Enter, committing rather than sending.
        # ChatGPT's handler ended the composition on the first Enter, which is
        # why only it passed.
        #
        # So the composition is cancelled explicitly, the composer is cleared,
        # and the text is typed WITHOUT an IME. Whether that guess was right is
        # not assumed either: the control Enter's own isComposing is recorded
        # and printed below.
        try:
            cdp.send("Input.imeSetComposition",
                     {"text": "", "selectionStart": -1, "selectionEnd": -1})
        except Exception:
            pass  # not every implementation accepts a cancel; the clear below still runs
        page.wait_for_timeout(300)

        composer.click()
        page.keyboard.press("ControlOrMeta+a")
        page.keyboard.press("Delete")
        page.wait_for_timeout(300)
        page.evaluate("() => { window.__ps.enters.length = 0; }")

        page.keyboard.type(COMPOSITION_TEXT, delay=40)
        page.wait_for_timeout(500)
        control_before = page.evaluate("() => window.__ps.text()")

        page.keyboard.press("Enter")
        page.wait_for_timeout(4_000)
        control_after = page.evaluate("() => window.__ps.text()")
        control_enters = page.evaluate("() => window.__ps.enters")
        control_sent = (
            len(control_before.strip()) > 0 and len(control_after.strip()) == 0
        )
        print(f"  before: {control_before!r}  after: {control_after!r}")
        print(f"  control Enter: {control_enters}")

        still_composing = any(e["isComposing"] for e in control_enters)
        if still_composing:
            # The control never ran as a control. Say so rather than reporting
            # it as a failed send.
            print("  ????  the control Enter ALSO arrived with isComposing=true, so the")
            print("        composition was never closed and this did not test a plain send")
            page.close()
            return 3, f"{name}: control Enter was still composing"

        if control_sent:
            print("  ok    a plain Enter DID send, so the negative result above is real")
            page.close()
            return 0, f"{name}: waits correctly (control confirmed)"
        print("  FAIL  a plain Enter did not send either - the observation method")
        print("        did not work, so the result above proves nothing")
        page.close()
        return 3, f"{name}: control failed, result not trustworthy"

    page.close()
    return 0, f"{name}: waits correctly (NO CONTROL - weaker)"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--control", action="store_true")
    parser.add_argument("--site", default="all", choices=[*SITES, "all"])
    parser.add_argument(
        "--attach",
        type=int,
        metavar="PORT",
        help=(
            "Attach to a browser YOU launched, over CDP, instead of launching one. "
            "See docs/manual-checks/isComposing.md."
        ),
    )
    args = parser.parse_args()

    names = list(SITES) if args.site == "all" else [args.site]
    results: list[tuple[int, str]] = []

    with sync_playwright() as p:
        if args.attach:
            # ATTACH, DO NOT LAUNCH.
            #
            # Playwright launching the browser is what trips the bot wall: it
            # sets --enable-automation and the AutomationControlled blink
            # feature, and navigator.webdriver comes back true. A login form
            # then refuses, correctly.
            #
            # This mode does none of that. YOU start an ordinary browser with
            # --remote-debugging-port and log in by hand, as a human, in a
            # browser carrying no automation flags at all. This then attaches
            # to it the way DevTools does.
            #
            # THIS IS NOT AN EVASION. Nothing is spoofed, no fingerprint is
            # forged, and no check is defeated - the browser genuinely is an
            # ordinary one and the person genuinely is a person. If a challenge
            # appears, a human answers it. That is the whole difference from
            # the stealth-flag approach this project refuses.
            endpoint = f"http://127.0.0.1:{args.attach}"
            print(f"attaching to {endpoint} (a browser you started)")
            try:
                browser = p.chromium.connect_over_cdp(endpoint)
            except Exception as error:
                print(f"  could not attach: {error}")
                print()
                print("Start the browser first - see docs/manual-checks/isComposing.md:")
                print("  Launch Edge yourself with two flags - the exact command is in")
                print("  docs/manual-checks/isComposing.md - then re-run this with")
                print(f"  --attach {args.attach}.")
                return 2
            if not browser.contexts:
                print("  attached, but the browser has no context open. Open a tab first.")
                return 2
            context = browser.contexts[0]
            automation = context.pages[0].evaluate("() => navigator.webdriver") if context.pages else None
            print(f"  attached. navigator.webdriver = {automation!r}")
            if automation is True:
                print("  NOTE: this browser reports itself as automated, so it was")
                print("  probably launched by a tool rather than by you. The bot wall")
                print("  will behave the same as before.")
        else:
            if not PROFILE.exists():
                print("No .live-profile. Run: python packages/extension/scripts/login-profile.py")
                return 2
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(PROFILE),
                channel="msedge",
                headless=False,
                viewport={"width": 1280, "height": 900},
            )

        for name in names:
            try:
                results.append(probe_site(context, name, SITES[name], args.control))
            except Exception as error:
                print(f"  probe raised: {error}")
                results.append((3, f"{name}: probe raised {type(error).__name__}"))

        # An attached browser belongs to the USER. Closing its context would
        # close their window and their tabs; only a launched one is ours to end.
        if not args.attach:
            context.close()

    print()
    print("=" * 68)
    print("SUMMARY")
    for code, line in results:
        tag = {0: "ok  ", 1: "FAIL", 3: "????"}[code]
        print(f"  {tag}  {line}")
    print("=" * 68)

    if any(code == 1 for code, _ in results):
        return 1
    if any(code == 3 for code, _ in results):
        return 3
    return 0



if __name__ == "__main__":
    sys.exit(main())
