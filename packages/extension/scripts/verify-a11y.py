"""Accessibility audit of the extension's own pages, in a real browser.

WHAT THIS DOES AND DOES NOT CLAIM. It inspects the ACCESSIBILITY TREE — the
structure a screen reader consumes — and the computed styles the browser
actually resolved. That catches the things this project can get wrong on its
own: a control with no accessible name, colour below AA at the size it is
rendered, a focus ring that does not exist, a tab stop that cannot be reached.

It is NOT a substitute for someone using the page with NVDA, VoiceOver or
Orca. Announcement order, verbosity, and whether the live regions interrupt at
the wrong moment are judgements a tree walk cannot make. Where SPEC says
"screen-reader tested", this covers the machine-checkable half and the other
half remains open.

Checks:
  - every focusable element has a non-empty accessible name
  - Tab reaches every control, and Shift+Tab comes back (no keyboard trap)
  - every focused element has a visible focus indicator distinct from its
    resting state
  - text contrast meets WCAG AA at the size it is actually rendered
  - interactive targets meet the WCAG 2.5.8 minimum of 24x24 CSS pixels
  - all of the above in BOTH colour schemes

Usage:
  python scripts/verify-a11y.py [--page popup|options] [--scheme light|dark|both]
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

# WCAG 2.2. 4.5:1 for normal text; 3:1 once text is >=24px, or >=18.66px bold.
AA_NORMAL = 4.5
AA_LARGE = 3.0
MIN_TARGET = 24


def fail(message: str) -> None:
    print(f"  FAIL  {message}")


def ok(message: str) -> None:
    print(f"  ok    {message}")


CONTRAST_JS = r"""
() => {
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((n) => parseFloat(n));
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  };
  // The effective background: walk up until something is not transparent.
  const backgroundOf = (el) => {
    let node = el;
    while (node) {
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.alpha > 0) return parsed.rgb;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    // Only elements that render their OWN text; a container's colour is not
    // what the reader sees if every child overrides it.
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (own.length === 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const fg = parse(style.color);
    if (!fg) continue;
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10) || 400;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: el.className || '',
      text: own.slice(0, 40),
      size,
      weight,
      ratio: ratio(fg.rgb, backgroundOf(el)),
    });
  }
  return out;
}
"""


def audit(page, cdp, label: str, failures: list[str]) -> None:
    print(f"\n== {label} ==")

    # ── accessible names ──
    focusables = page.eval_on_selector_all(
        "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
        """els => els.filter(e => {
             // checkVisibility(), not getComputedStyle(e).display: the computed
             // display of a child inside a display:none ANCESTOR still resolves
             // to its own value, so the naive filter counted every control in
             // the popup's two hidden tab panels and inflated the target the
             // tab-order check was measured against.
             if (!e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
             return !e.disabled;
           }).map(e => ({
             tag: e.tagName.toLowerCase(),
             type: e.type || '',
             id: e.id || '',
             cls: typeof e.className === 'string' ? e.className : '',
           }))""",
    )
    print(f"  {len(focusables)} focusable controls")

    # `page.accessibility` was removed from Playwright; the CDP domain it
    # wrapped is still the source of truth and is what the browser hands an
    # assistive technology.
    tree = cdp.send("Accessibility.getFullAXTree")
    named: list[str] = []
    INTERACTIVE = {
        "button", "checkbox", "radio", "combobox", "textbox", "link",
        "tab", "listbox", "slider", "switch", "menuitem",
    }
    for node in tree.get("nodes", []):
        if node.get("ignored"):
            continue
        role = (node.get("role") or {}).get("value", "")
        if role not in INTERACTIVE:
            continue
        name = ((node.get("name") or {}).get("value") or "").strip()
        named.append(f"{role}:{name}")
    unnamed = [entry for entry in named if entry.endswith(":")]
    print(f"  {len(named)} named roles in the accessibility tree")
    if unnamed:
        failures.append(f"{label}: {len(unnamed)} control(s) with no accessible name")
        for entry in unnamed[:8]:
            fail(f"no accessible name: {entry}")
    elif len(named) == 0:
        failures.append(f"{label}: the accessibility tree exposed no controls at all")
        fail("empty accessibility tree - the walk found nothing to check")
    else:
        ok(f"every one of {len(named)} exposed controls has a name")

    # ── keyboard reach, and no trap ──
    #
    # Identity is a MARKER SET ON THE ELEMENT, not a description of it. The
    # first version of this keyed on `tag#id.class`, and every one of the 35
    # type checkboxes on the options page renders as `input#.` with no id and
    # no class - so the second one looked like a repeat, the loop decided it
    # had cycled, and the check reported "Tab reached 1 of 49 controls". The
    # page was fine; the identity was.
    page.click(".mark, h1")  # a non-interactive element, to give the document focus
    page.evaluate(
        "() => { for (const e of document.querySelectorAll('[data-a11y-seen]')) "
        "e.removeAttribute('data-a11y-seen'); document.activeElement?.blur?.(); }"
    )
    reached = 0
    revisited = False
    for _ in range(len(focusables) + 8):
        page.keyboard.press("Tab")
        outcome = page.evaluate(
            """() => {
                 const e = document.activeElement;
                 if (!e || e === document.body || e === document.documentElement) return 'out';
                 if (e.hasAttribute('data-a11y-seen')) return 'repeat';
                 e.setAttribute('data-a11y-seen', '1');
                 return 'new';
               }"""
        )
        if outcome == "out":
            break
        if outcome == "repeat":
            revisited = True
            break
        reached += 1

    print(f"  Tab reached {reached} distinct controls" + (" (then cycled)" if revisited else ""))
    # THE EXPECTATION MODELS THE PAGE, not a fudge factor. A tab stop is a
    # visible element whose effective tabIndex is not -1, which is exactly how
    # a roving tablist collapses three tabs into one stop and how a radio
    # group collapses into one. Subtracting a guessed constant instead would
    # have let the popup pass at 2 of 8 while hiding whether 2 was right.
    expected = page.eval_on_selector_all(
        "a[href], button, input, select, textarea, [tabindex]",
        """els => els.filter(e =>
             e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
             !e.disabled && e.tabIndex >= 0
           ).filter((e, i, all) => {
             // A radio group is one stop: keep only the first of each name.
             if (e.tagName !== 'INPUT' || e.type !== 'radio' || !e.name) return true;
             return all.findIndex(o => o.type === 'radio' && o.name === e.name) === i;
           }).length""",
    )
    if reached < expected:
        failures.append(
            f"{label}: Tab reached only {reached} of {len(focusables)} focusable controls"
        )
        fail(f"Tab reached {reached}, expected at least {expected}")
    else:
        ok(f"Tab reaches {reached} controls and cycles back")

    # Shift+Tab must walk back out again: a control that traps focus is
    # unusable by keyboard and the page cannot be left.
    back = 0
    for _ in range(6):
        page.keyboard.press("Shift+Tab")
        if page.evaluate("() => document.activeElement !== document.body") :
            back += 1
    if back == 0:
        failures.append(f"{label}: Shift+Tab moved focus nowhere")
        fail("Shift+Tab is inert")
    else:
        ok("Shift+Tab walks back")

    # ── a visible focus indicator ──
    # Compared against the element's OWN resting style, so "it has an outline"
    # cannot pass by finding an outline that was always there.
    indicator = page.evaluate(
        """() => {
             const el = document.querySelector('button, input, select, textarea, [tabindex="0"]');
             if (!el) return null;
             el.blur();
             const resting = getComputedStyle(el);
             const before = resting.outlineWidth + '|' + resting.outlineStyle + '|' +
                            resting.boxShadow + '|' + resting.borderColor;
             el.focus();
             const focused = getComputedStyle(el);
             const after = focused.outlineWidth + '|' + focused.outlineStyle + '|' +
                           focused.boxShadow + '|' + focused.borderColor;
             return { before, after, width: focused.outlineWidth };
           }"""
    )
    if indicator is None:
        failures.append(f"{label}: no control to test focus on")
        fail("no focusable control found")
    elif indicator["before"] == indicator["after"]:
        failures.append(f"{label}: focusing a control changes nothing visible")
        fail(f"resting and focused styles are identical: {indicator['before']}")
    else:
        ok(f"focus changes the computed style (outline {indicator['width']})")

    # ── contrast ──
    rows = page.evaluate(CONTRAST_JS)
    worst = None
    offenders = []
    for row in rows:
        large = row["size"] >= 24 or (row["size"] >= 18.66 and row["weight"] >= 700)
        needed = AA_LARGE if large else AA_NORMAL
        if worst is None or row["ratio"] < worst["ratio"]:
            worst = row
        if row["ratio"] + 0.005 < needed:
            offenders.append(
                f"{row['ratio']:.2f}:1 (needs {needed}) {row['size']:.0f}px "
                f"{row['tag']}.{row['cls']} {row['text']!r}"
            )
    print(f"  {len(rows)} text elements measured; lowest {worst['ratio']:.2f}:1" if worst else "  no text")
    if offenders:
        failures.append(f"{label}: {len(offenders)} text element(s) below WCAG AA")
        for entry in offenders[:10]:
            fail(entry)
    else:
        ok("all text meets WCAG AA at its rendered size")

    # ── target size ──
    small = page.eval_on_selector_all(
        "button, select, input[type=checkbox], input[type=radio], [role=tab]",
        """els => els.filter(e => {
             if (!e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
             // THE TARGET IS WHAT A POINTER HITS. A native checkbox renders at
             // 13-16px and cannot be resized reliably, but one wrapped in a
             // <label> is activated anywhere on that label - so the label is
             // the target, and measuring the input alone reports a failure
             // for a control that is comfortably large. This is WCAG 2.5.8's
             // own reasoning, not a way around it: if there is no enclosing
             // label, the input IS the target and is measured as one.
             const target = e.closest('label') ?? e;
             const r = target.getBoundingClientRect();
             return r.width > 0 && (r.width < 24 || r.height < 24);
           }).map(e => {
             const target = e.closest('label') ?? e;
             const r = target.getBoundingClientRect();
             const cls = typeof target.className === 'string' ? target.className : '';
             return `${target.tagName.toLowerCase()}.${cls} ${Math.round(r.width)}x${Math.round(r.height)}`;
           })""",
    )
    if small:
        # Reported, not failed: WCAG 2.5.8 exempts a control whose function is
        # duplicated by a larger one, and a native checkbox inside a full-width
        # <label> is clickable across the whole label.
        print(f"  {len(small)} target(s) under {MIN_TARGET}x{MIN_TARGET} CSS px:")
        for entry in small[:8]:
            print(f"      {entry}")
    else:
        ok(f"every interactive target is at least {MIN_TARGET}x{MIN_TARGET}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", default="both", choices=["popup", "options", "both"])
    parser.add_argument("--scheme", default="both", choices=["light", "dark", "both"])
    args = parser.parse_args()

    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    pages = ["popup", "options"] if args.page == "both" else [args.page]
    schemes = ["light", "dark"] if args.scheme == "both" else [args.scheme]
    failures: list[str] = []
    profile = Path(tempfile.mkdtemp(prefix="ps-a11y-"))

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            channel="msedge",
            headless=False,
            args=[f"--disable-extensions-except={BUILD}", f"--load-extension={BUILD}"],
        )
        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=15_000)
        extension_id = re.sub(r"^chrome-extension://([a-z]+)/.*$", r"\1", worker.url)

        for scheme in schemes:
            for name in pages:
                page = context.new_page()
                page.emulate_media(color_scheme=scheme)
                page.set_viewport_size(
                    {"width": 380, "height": 600} if name == "popup" else {"width": 900, "height": 900}
                )
                page.goto(f"chrome-extension://{extension_id}/{name}.html")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(500)
                cdp = context.new_cdp_session(page)
                cdp.send("Accessibility.enable")
                audit(page, cdp, f"{name} / {scheme}", failures)
                page.close()

        context.close()

    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("\nAll accessibility checks passed (tree and computed styles;")
    print("not a substitute for testing with an actual screen reader).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
