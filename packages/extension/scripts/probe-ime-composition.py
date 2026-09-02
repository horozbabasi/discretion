"""Can a genuine `isComposing` Enter be produced without a human at an IME?

WHY THIS EXISTS. The one send route still unverified is an Enter pressed while
a CJK input method is composing. Our side is settled - the adapter skips it -
but whether the SITE's own handler also skips it is unknown, and answering that
needs the real page.

Before asking a person to do it by hand, this establishes what a machine can
and cannot produce, so the manual instructions ask for exactly the part that
genuinely needs a person and no more.

Three things are measured, in order:

  1. Does `Input.imeSetComposition` over CDP put the page into a real
     composition state - `compositionstart` fired, `isComposing` true on a
     subsequent keydown?
  2. Does a plain synthetic `KeyboardEvent` with `isComposing: true` reach a
     listener as trusted? (Expected: no. `isTrusted` cannot be forged.)
  3. Does the DIAGNOSTIC SNIPPET that ships in docs/manual-checks report
     correctly in both cases?

Point 3 is the one that matters. If the snippet is going to be pasted into a
signed-in session by a person, it has to be known-good before it goes out.

Usage:
  python packages/extension/scripts/probe-ime-composition.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
SNIPPET = ROOT.parent.parent / "docs" / "manual-checks" / "ime-diagnostic.js"

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>composition probe</title></head>
<body>
  <div id="log"></div>
  <div id="composer" contenteditable="true"
       style="border:1px solid #888;padding:8px;min-height:40px;width:400px"></div>
  <script>
    const seen = [];
    window.__seen = seen;
    const composer = document.getElementById('composer');
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
      composer.addEventListener(type, (e) => seen.push({ type, data: e.data, trusted: e.isTrusted }));
    }
    composer.addEventListener('keydown', (e) => {
      seen.push({ type: 'keydown', key: e.key, isComposing: e.isComposing,
                  keyCode: e.keyCode, trusted: e.isTrusted });
    });
  </script>
</body></html>"""


def main() -> int:
    failures: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        context = browser.new_context()
        page = context.new_page()
        page.set_content(PAGE, wait_until="load")
        page.click("#composer")
        cdp = context.new_cdp_session(page)

        print("\n-- 1. CDP Input.imeSetComposition --")
        try:
            cdp.send(
                "Input.imeSetComposition",
                {"text": "にほん", "selectionStart": 3, "selectionEnd": 3},
            )
            page.wait_for_timeout(120)
            # Enter WHILE the composition is open. This is the event the whole
            # question is about.
            cdp.send("Input.dispatchKeyEvent", {
                "type": "rawKeyDown", "key": "Enter", "code": "Enter",
                "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13,
            })
            page.wait_for_timeout(120)
            seen = page.evaluate("() => window.__seen")
            started = [e for e in seen if e["type"] == "compositionstart"]
            enters = [e for e in seen if e["type"] == "keydown" and e["key"] == "Enter"]
            print(f"  compositionstart events : {len(started)} (trusted={[e['trusted'] for e in started]})")
            print(f"  Enter keydowns          : {len(enters)}")
            for e in enters:
                print(f"    isComposing={e['isComposing']} keyCode={e['keyCode']} trusted={e['trusted']}")
            composing_enter = any(e["isComposing"] for e in enters)
            print(f"  VERDICT: CDP {'CAN' if composing_enter else 'CANNOT'} produce a composing Enter")
        except Exception as error:
            print(f"  Input.imeSetComposition failed: {error}")
            composing_enter = False
            print("  VERDICT: CDP CANNOT produce a composing Enter")

        print("\n-- 2. a synthetic KeyboardEvent claiming isComposing --")
        forged = page.evaluate("""() => {
          const out = [];
          const composer = document.getElementById('composer');
          const once = (e) => out.push({ isComposing: e.isComposing, trusted: e.isTrusted });
          composer.addEventListener('keydown', once, { once: true });
          composer.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
          return out;
        }""")
        print(f"  {forged}")
        if forged and forged[0]["trusted"]:
            failures.append("a synthetic event arrived as trusted, which should be impossible")
        else:
            print("  as expected: a page-dispatched event is NOT trusted, so a site that")
            print("  checks isTrusted would ignore it. Synthetic events cannot settle this.")

        print("\n-- 3. the diagnostic snippet that ships to a human --")
        if not SNIPPET.exists():
            failures.append(f"snippet missing at {SNIPPET}")
            print(f"  FAIL  {SNIPPET} does not exist")
        else:
            page.evaluate(SNIPPET.read_text(encoding="utf-8"))
            armed = page.evaluate("() => typeof window.__psImeReport === 'function'")
            if not armed:
                failures.append("the snippet did not install its reporter")
                print("  FAIL  window.__psImeReport was not installed")
            else:
                print("  ok    snippet installed and exposed __psImeReport()")
                if composing_enter:
                    cdp.send("Input.imeSetComposition",
                             {"text": "かんじ", "selectionStart": 3, "selectionEnd": 3})
                    page.wait_for_timeout(100)
                    cdp.send("Input.dispatchKeyEvent", {
                        "type": "rawKeyDown", "key": "Enter", "code": "Enter",
                        "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13})
                    page.wait_for_timeout(200)
                    report = page.evaluate("() => window.__psImeReport()")
                    print(f"  snippet observed: {report}")
                    if report.get("composingEnters", 0) < 1:
                        failures.append("the snippet did not record a composing Enter that CDP produced")
                else:
                    print("  NOT RUN  the snippet's composing-Enter path: CDP could not")
                    print("           produce one, so only a human at an IME can exercise it.")

        context.close()
        browser.close()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("Probe complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
