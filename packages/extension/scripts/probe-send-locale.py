"""Measures which send-control tier each site resolves at, per LOCALE.

THE QUESTION THIS SETTLES. Some send-control selector clauses match an English
accessible name. If the locale-independent clauses match on a real page, the
English one is additive and a non-English user is fine. If they do NOT, the
English clause is load-bearing and a non-English user's click is never
intercepted — which is a plaintext send, not a degraded state.

That is a question about real markup, so it is measured rather than argued.

WHAT IT PRINTS. Selector match COUNTS, tag names, and the send control's own
aria-label. The label is site chrome — a public UI string that a fix has to
key on — not user content, and nothing here reads the composer, the transcript,
or the account. No page text is captured.

POSITIVE CONTROL. If the composer itself does not resolve, every send-button
count is zero for a reason that has nothing to do with locale, and the run
would "prove" a leak that is not there. So the composer is asserted FIRST and
the locale result is refused if it is missing.

Usage:
  python scripts/probe-send-locale.py --site gemini --locales en,tr
  (add --profile PATH to reuse a logged-in profile)
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

SITES = {
    "gemini": {
        "url": "https://gemini.google.com/app",
        "composer": '[contenteditable="true"][role="textbox"], rich-textarea [contenteditable="true"]',
        "tiers": [
            ("1a marker data-test-id (locale-independent)", '[data-test-id="send-button"]'),
            ("1b marker data-testid (locale-independent)", '[data-testid="send-button"]'),
            ("1c marker .send-button CLASS (locale-independent, class-tier)", '.send-button'),
            ("2 icon attribute (locale-independent)",
             'mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send"]'),
            ("3 icon ligature (locale-fragile)", "MAT_ICON_LIGATURE"),
            ("4 English aria-label (ENGLISH ONLY)", '[aria-label="Send message" i]'),
        ],
    },
    "claude": {
        "url": "https://claude.ai/new",
        "composer": '[contenteditable="true"]',
        "tiers": [
            ("1 test id (locale-independent)", 'button[data-testid="send-button"]'),
            ("2 submit type (locale-independent)", 'button[type="submit"]'),
            ("3 English aria-label (ENGLISH ONLY)",
             'button[aria-label="Send message" i], button[aria-label="Send Message" i]'),
        ],
    },
    "chatgpt": {
        "url": "https://chatgpt.com/",
        "composer": '#prompt-textarea, [contenteditable="true"]',
        "tiers": [
            ("1 test id (locale-independent)", 'button[data-testid="send-button"]'),
            ("2 element id (locale-independent)", 'button[id="composer-submit-button"]'),
            ("3 form submit (locale-independent)",
             'form[data-type="unified-composer"] button[type="submit"]'),
        ],
    },
}

COUNT_JS = r"""
(sel) => {
  // Shadow-piercing, because these sites use custom elements heavily and a
  // plain querySelectorAll would report 0 for a control that is really there.
  const out = [];
  const visit = (root) => {
    let found = [];
    try {
      found = sel === 'MAT_ICON_LIGATURE'
        ? [...root.querySelectorAll('mat-icon')].filter(
            (i) => (i.textContent || '').replace(/[\s​-‏‪-‮]/g, '')
                     .toLowerCase() === 'send')
        : [...root.querySelectorAll(sel)];
    } catch { found = []; }
    for (const el of found) out.push(el);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);
  return out.length;
}
"""

# The send control's own accessible name, so a fix knows what it must key on.
LABEL_JS = r"""
() => {
  const out = [];
  const visit = (root) => {
    for (const el of root.querySelectorAll('button, [role="button"]')) {
      const label = el.getAttribute('aria-label');
      if (!label) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ tag: el.tagName.toLowerCase(), label,
                 testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null,
                 type: el.getAttribute('type') || null,
                 cls: (el.className && typeof el.className === 'string')
                        ? el.className.split(' ').slice(0, 2).join(' ') : '' });
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot);
  };
  visit(document);
  return out.slice(0, 40);
}
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="gemini", choices=sorted(SITES))
    parser.add_argument("--locales", default="en,tr")
    parser.add_argument("--profile", default=None, help="a logged-in user-data-dir to reuse")
    parser.add_argument("--wait", type=int, default=12000, help="ms to let the app settle")
    args = parser.parse_args()

    site = SITES[args.site]
    locales = [x.strip() for x in args.locales.split(",") if x.strip()]
    results: dict[str, dict] = {}

    with sync_playwright() as p:
        for locale in locales:
            # A COPY of the profile per run: two Chromium instances cannot share
            # one user-data-dir, and running them in sequence against the same
            # directory leaves lock files behind.
            if args.profile:
                import shutil

                work = Path(tempfile.mkdtemp(prefix=f"ps-{locale}-"))
                shutil.copytree(args.profile, work / "p", dirs_exist_ok=True)
                user_dir = str(work / "p")
            else:
                user_dir = tempfile.mkdtemp(prefix=f"ps-{locale}-")

            context = p.chromium.launch_persistent_context(
                user_data_dir=user_dir,
                channel="msedge",
                headless=False,
                args=[
                    f"--disable-extensions-except={BUILD}",
                    f"--load-extension={BUILD}",
                    f"--lang={locale}",
                ],
                locale=locale,
            )
            page = context.new_page()
            page.goto(site["url"], wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(args.wait)

            composers = page.evaluate(COUNT_JS, site["composer"])

            # TYPE FIRST. All three sites render the send control only once the
            # composer is non-empty - M9 spent four rounds on Gemini before
            # noticing that every reading had been taken in the one state where
            # the element does not exist. Measuring an empty composer answers a
            # different question and looks exactly like an answer to this one.
            buttons_before = page.evaluate(COUNT_JS, "button, [role='button']")
            typed = False
            try:
                target = page.locator(site["composer"]).first
                target.click(timeout=8000)
                page.keyboard.type("hello")
                page.wait_for_timeout(2500)
                typed = True
            except Exception as error:
                print(f"  (could not type into the composer: {error})")
            buttons_after = page.evaluate(COUNT_JS, "button, [role='button']")
            tiers = [(name, page.evaluate(COUNT_JS, sel)) for name, sel in site["tiers"]]
            labels = page.evaluate(LABEL_JS)

            results[locale] = {
                "composers": composers,
                "typed": typed,
                "buttonsBefore": buttons_before,
                "buttonsAfter": buttons_after,
                "tiers": tiers,
                "labels": labels,
            }
            context.close()

    print(f"\n=== {args.site} ===")
    verdict_possible = True
    for locale, data in results.items():
        print(f"\n-- locale {locale} --")
        print(f"  composer elements: {data['composers']}; typed: {data['typed']}; "
              f"controls {data['buttonsBefore']} -> {data['buttonsAfter']}")
        if not data["typed"] or data["buttonsAfter"] <= data["buttonsBefore"]:
            # The send control appears only once the composer has text. If
            # typing failed, or no control appeared after typing, there is
            # nothing to find and every zero below says so for the wrong
            # reason.
            print("  !! NO SEND CONTROL APPEARED. Counts below cannot answer the locale question.")
            verdict_possible = False
        if data["composers"] == 0:
            # THE VACUOUS-PASS GUARD. Without a composer the page never
            # rendered a send control either, and every zero below means
            # "not signed in", not "locale broke it".
            print("  !! NO COMPOSER. Every count below is meaningless for this question.")
            verdict_possible = False
        for name, count in data["tiers"]:
            marker = "  <-- matches" if count > 0 else ""
            print(f"    tier {name}: {count}{marker}")

    if verdict_possible and len(results) >= 2:
        print("\n-- verdict --")
        keys = list(results)
        base, other = results[keys[0]], results[keys[1]]
        li_base = sum(c for n, c in base["tiers"] if "ENGLISH ONLY" not in n)
        li_other = sum(c for n, c in other["tiers"] if "ENGLISH ONLY" not in n)
        if li_base > 0 and li_other > 0:
            print(f"  Locale-independent clauses match in BOTH {keys[0]} and {keys[1]}.")
            print("  The English clause is ADDITIVE. No locale exposure on this page today.")
        elif li_other == 0:
            print(f"  Locale-independent clauses match NOTHING in {keys[1]}.")
            print("  The English clause is LOAD-BEARING: a click on a non-English UI")
            print("  would not be intercepted, and the send would carry the original text.")
        else:
            print("  Mixed. Read the per-tier counts above.")
    else:
        print("\n-- verdict --\n  NOT ESTABLISHED (see the composer guard above).")

    out = Path(tempfile.gettempdir()) / f"send-locale-{args.site}.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nfull result: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
