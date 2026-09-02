"""Does chatgpt.com itself send when Enter commits an IME candidate?

─────────────────────────────────────────────────────────────────────────────
THE LAST UNVERIFIED SEND ROUTE

Our side is settled: the adapter skips an Enter whose `isComposing` is true, so
PrivacyShield does not gate that keystroke. That is only SAFE IF THE SITE ALSO
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
  python packages/extension/scripts/probe-ime-live.py [--control]

  --control  also press a plain Enter afterwards, to prove a send WOULD have
             been observable. Without it a negative result is not conclusive.
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


def session_state(page) -> dict:
    """Signed in, or looking at the marketing page?

    THIS DISTINCTION IS LOAD-BEARING, and the first version of this script did
    not make it. Logged out, chatgpt.com still renders a `<textarea>` on its
    landing page. The script found it, composed into it, pressed Enter, saw
    nothing sent, and would have reported WAITS CORRECTLY - about a textarea
    with no send handler attached to it at all.

    Its own control step caught that: a plain Enter did not send either, it
    inserted a newline. Which is why the control exists.

    The signed-in composer is a ProseMirror contenteditable at
    `#prompt-textarea`, alongside a send button. A bare textarea with "Log in"
    on the page is the landing page, and answers a different question.
    """
    return page.evaluate("""() => {
      const prompt = document.querySelector('#prompt-textarea');
      const loginish = [...document.querySelectorAll('a,button')]
        .map((e) => (e.textContent || '').trim())
        .filter((t) => /log ?in|sign ?up|sign ?in/i.test(t));
      return {
        hasPromptComposer: prompt !== null && prompt.isContentEditable === true,
        contentEditables: document.querySelectorAll('[contenteditable="true"]').length,
        hasSendButton: document.querySelector('[data-testid="send-button"]') !== null,
        loginAffordances: loginish.slice(0, 4),
      };
    }""")


def composer_of(page):
    """The signed-in app composer only. Never the landing-page textarea."""
    for selector in ("#prompt-textarea", "[contenteditable='true']"):
        found = page.locator(selector).first
        if found.count() > 0:
            try:
                if found.is_visible():
                    return found, selector
            except Exception:
                continue
    return None, None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--control", action="store_true")
    args = parser.parse_args()

    if not PROFILE.exists():
        print("No .live-profile. Run: python packages/extension/scripts/login-profile.py")
        return 2

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            channel="msedge",
            headless=False,
            viewport={"width": 1280, "height": 900},
        )
        page = context.pages[0] if context.pages else context.new_page()

        print("-- loading chatgpt.com with the hand-logged-in profile --")
        try:
            page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=60_000)
        except Exception as error:
            print(f"  could not load: {error}")
            context.close()
            return 1
        page.wait_for_timeout(6_000)

        url = page.url
        title = (page.title() or "").strip()
        body = (page.inner_text("body") or "")[:400].replace("\n", " ")
        print(f"  url   : {url}")
        print(f"  title : {title!r}")

        state = session_state(page)
        print(f"  session: {state}")
        composer, selector = composer_of(page)

        if not state["hasPromptComposer"] or composer is None:
            print(f"  body  : {body[:160]!r}")
            print()
            print("NOT SIGNED IN - this is the logged-out landing page.")
            if state["loginAffordances"]:
                print(f"  the page offers: {state['loginAffordances']}")
            print()
            print("The site's real send handler is only reachable behind the login, so")
            print("the question stays OPEN. It is NOT reported as a pass: a landing-page")
            print("textarea that sends nothing is not evidence that a composing Enter is")
            print("handled correctly.")
            print()
            print("To settle it:")
            print("  1. python packages/extension/scripts/login-profile.py")
            print("     - log in BY HAND in the window it opens, then close it")
            print("  2. python packages/extension/scripts/probe-ime-live.py --control")
            print()
            print("No password is typed, read or stored by any script here, and this")
            print("one will not attempt to log in or to get past a challenge.")
            context.close()
            return 3

        print(f"  composer: {selector}")
        composer.click()
        page.wait_for_timeout(400)

        # Instrument BEFORE composing, so nothing is missed.
        page.evaluate(
            """(sel) => {
              const node = document.querySelector(sel);
              window.__ps = { enters: [], cleared: 0, text: () =>
                (typeof node.value === 'string' ? node.value : (node.textContent ?? '')) };
              window.__psNode = node;
              node.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') window.__ps.enters.push({
                  isComposing: e.isComposing, keyCode: e.keyCode, trusted: e.isTrusted });
              }, true);
            }""",
            selector,
        )

        cdp = context.new_cdp_session(page)

        print()
        print("-- composing Enter (the actual question) --")
        cdp.send("Input.imeSetComposition", {
            "text": COMPOSITION_TEXT,
            "selectionStart": len(COMPOSITION_TEXT),
            "selectionEnd": len(COMPOSITION_TEXT),
        })
        page.wait_for_timeout(500)
        before = page.evaluate("() => window.__ps.text()")
        print(f"  composer before Enter: {before!r}")

        cdp.send("Input.dispatchKeyEvent", {
            "type": "rawKeyDown", "key": "Enter", "code": "Enter",
            "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13,
        })
        cdp.send("Input.dispatchKeyEvent", {
            "type": "keyUp", "key": "Enter", "code": "Enter",
            "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13,
        })
        page.wait_for_timeout(2_500)

        after = page.evaluate("() => window.__ps.text()")
        enters = page.evaluate("() => window.__ps.enters")
        print(f"  composer after Enter : {after!r}")
        print(f"  Enter events seen    : {enters}")

        composing_seen = any(e["isComposing"] for e in enters)
        sent = len(before.strip()) > 0 and len(after.strip()) == 0

        print()
        if not composing_seen:
            print("INCONCLUSIVE: no Enter arrived with isComposing=true, so the")
            print("composition state did not reach the site's handler. The question")
            print("stays OPEN rather than being answered by a run that did not test it.")
            verdict = 3
        elif sent:
            print("*** SENDS PREMATURELY ***")
            print("An Enter that only committed an IME candidate submitted the message.")
            print("A CJK user can send ungated text. This is a real defect and the")
            print("adapter cannot skip a composing Enter unilaterally.")
            verdict = 1
        else:
            print("WAITS CORRECTLY: the composing Enter committed the candidate and did")
            print("NOT submit. Skipping it in the adapter matches what the site does.")
            verdict = 0

        if args.control and not sent:
            print()
            print("-- control: a plain Enter, to show a send would have been visible --")
            print("   (this sends one short message to your account, on purpose)")
            page.wait_for_timeout(500)
            control_before = page.evaluate("() => window.__ps.text()")
            page.keyboard.press("Enter")
            page.wait_for_timeout(3_000)
            control_after = page.evaluate("() => window.__ps.text()")
            control_sent = len(control_before.strip()) > 0 and len(control_after.strip()) == 0
            print(f"  before: {control_before!r}  after: {control_after!r}")
            if control_sent:
                print("  ok    a plain Enter DID send, so the negative result above is real")
            else:
                print("  FAIL  a plain Enter did not send either - the observation method")
                print("        did not work, so the result above proves nothing")
                verdict = 3

        page.wait_for_timeout(1_000)
        context.close()
        return verdict


if __name__ == "__main__":
    sys.exit(main())
