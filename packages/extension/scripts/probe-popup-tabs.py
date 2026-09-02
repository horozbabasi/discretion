"""Does keyboard tab switching in the popup actually change the PANEL?

Written because a store screenshot named `popup-en-status.png` showed the
Status tab focused above Quick Redact's content. Two explanations fit, and they
need completely different fixes:

  (a) the screenshot script moved focus without activating - a script bug;
  (b) activation updates the tab strip but not the panel - a REAL bug in
      shipping code, and an accessibility defect: a keyboard user would move
      through the tabs and see the wrong panel.

`popup.ts` calls `select(next)` on arrow/Home/End, so (a) looked unlikely on
reading. Reading is not measuring.

THE ANSWER WAS (c), AND THIS PROBE'S FIRST VERSION GOT IT WRONG. Neither: on an
UNSUPPORTED page the Status panel deliberately renders the Quick Redact pitch,
with a comment in renderStatus explaining that the badge already says the
extension does not run here, so the panel is better spent telling the user what
they CAN do. The first version of this file asserted "Status selected while
'mask text for anywhere' is showing => REAL BUG" and fired on correct
behaviour.

The assertion below is now the actual invariant - the visible panel is the one
the selected tab's aria-controls points at - instead of a guess about text. A
check that cries wolf is worse than no check, and text heuristics about a
surface that legitimately varies by context are exactly how you build one.

Usage:
  python packages/extension/scripts/probe-popup-tabs.py
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


def visible_panel(page) -> dict:
    return page.evaluate(
        """() => {
          const tabs = [...document.querySelectorAll('.tab')].map((t) => ({
            label: t.textContent.trim(),
            selected: t.getAttribute('aria-selected'),
            focused: t === document.activeElement,
          }));
          const panels = [...document.querySelectorAll('[role="tabpanel"]')].map((p) => ({
            id: p.id,
            hidden: p.hasAttribute('hidden') || getComputedStyle(p).display === 'none',
          }));
          const selectedTab = [...document.querySelectorAll('.tab')]
            .find((t) => t.getAttribute('aria-selected') === 'true');
          return {
            tabs,
            visiblePanelIds: panels.filter((p) => !p.hidden).map((p) => p.id),
            // The invariant: the selected tab names the panel that is showing.
            controls: selectedTab ? selectedTab.getAttribute('aria-controls') : null,
          };
        }"""
    )


def main() -> int:
    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    failures: list[str] = []
    profile = Path(tempfile.mkdtemp(prefix="ps-tabs-"))

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile), channel="msedge", headless=False,
            args=[f"--disable-extensions-except={BUILD}", f"--load-extension={BUILD}"],
        )
        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=15_000)
        ext = re.sub(r"^chrome-extension://([a-z]+)/.*$", r"\1", worker.url)

        page = context.new_page()
        page.set_viewport_size({"width": 380, "height": 600})
        page.goto(f"chrome-extension://{ext}/popup.html")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(600)

        print("-- initial --")
        print(f"  {visible_panel(page)}")

        print("\n-- click Quick Redact --")
        page.locator(".tab").nth(1).click()
        page.wait_for_timeout(300)
        after_click = visible_panel(page)
        print(f"  {after_click}")

        print("\n-- then press Home (should return to Status) --")
        page.focus(".tab")
        page.keyboard.press("Home")
        page.wait_for_timeout(300)
        after_home = visible_panel(page)
        print(f"  {after_home}")

        selected = [t["label"] for t in after_home["tabs"] if t["selected"] == "true"]
        visible = after_home["visiblePanelIds"]
        controls = after_home["controls"]
        print()
        if len(selected) != 1:
            failures.append(f"expected exactly one selected tab, got {selected}")
        if len(visible) != 1:
            failures.append(f"expected exactly one visible panel, got {visible}")

        # THE INVARIANT, stated structurally: whatever the selected tab points
        # at with aria-controls is the panel that is showing. This says nothing
        # about what that panel CONTAINS, which is renderStatus's business and
        # legitimately depends on whether the page is supported.
        if len(visible) == 1 and controls is not None:
            if visible[0] != controls:
                failures.append(
                    f"selected tab controls {controls!r} but {visible[0]!r} is visible"
                )
            else:
                print(f"  ok    selected tab controls {controls!r}, and that is what shows")

        context.close()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("Keyboard tab switching moves the panel with the tab.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
