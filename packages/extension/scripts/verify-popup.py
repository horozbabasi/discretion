"""Loads the built extension and drives its popup in a real browser.

WHY A REAL BROWSER AND NOT JSDOM. Everything this checks is something jsdom
would happily report as fine while Chrome disagreed:

  - the popup HTML is loaded under the extension's own CSP, which forbids
    inline script. A jsdom render never evaluates that policy.
  - chrome.i18n picks the locale and reads _locales/, which only exists once
    the extension is packed and loaded.
  - the RTL check needs the browser's own UI language to drive `dir`.
  - computed contrast and focus rings are the browser's, not a library's.

It also refuses to report success on an empty page: every assertion names the
thing it looked at, and the run fails if the popup rendered nothing, which is
exactly what a CSP violation produces.

Usage:
  python scripts/verify-popup.py [--locale ar] [--headed] [--out DIR]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

# This script prints Arabic, Japanese and Hindi. The Windows console defaults
# to cp1252, which raises UnicodeEncodeError on the first translated tab label
# - so the run dies during the check that matters most.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"


def fail(message: str) -> None:
    print(f"  FAIL  {message}")


def ok(message: str) -> None:
    print(f"  ok    {message}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", default="en", help="browser UI language, e.g. ar")
    parser.add_argument("--headed", action="store_true", help="kept for symmetry; extensions always need a head")
    parser.add_argument("--out", default=None, help="directory for screenshots")
    parser.add_argument(
        "--site",
        default=None,
        help="a supported site to exercise the content script's popup-status handler",
    )
    args = parser.parse_args()

    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    out_dir = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="ps-popup-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    failures: list[str] = []
    # A check that did not run must never be invisible in the summary: a run
    # that printed 'All checks passed' while silently skipping one is how a
    # green result stops meaning anything.
    skipped: list[str] = []
    profile = Path(tempfile.mkdtemp(prefix="ps-profile-"))

    with sync_playwright() as p:
        # channel='msedge' and headless=False, matching verify-loads.py: an
        # MV3 extension needs a persistent context and a head, and the system
        # Edge is already on this machine so nothing has to be downloaded.
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile),
            channel="msedge",
            headless=False,
            args=[
                f"--disable-extensions-except={BUILD}",
                f"--load-extension={BUILD}",
                f"--lang={args.locale}",
            ],
            locale=args.locale,
        )

        console: list[str] = []
        page_errors: list[str] = []

        # The extension id is not knowable in advance; it is derived from the
        # unpacked path. Reading it from the service worker's URL is the only
        # way that does not involve guessing.
        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=15_000)
        extension_id = re.sub(r"^chrome-extension://([a-z]+)/.*$", r"\1", worker.url)
        print(f"extension id: {extension_id}")

        page = context.new_page()
        # THE REAL SIZE. A popup is 380px wide and at most 600 tall; a
        # screenshot taken in a 1280x720 tab shows a layout no user will ever
        # see, and hides exactly the overflow problems the check is for.
        page.set_viewport_size({"width": 380, "height": 600})
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto(f"chrome-extension://{extension_id}/popup.html")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(600)

        print("\n-- the page rendered at all --")
        # A CSP violation, a module that threw, a missing file: all of them
        # produce a shell with an empty body, and all of them would otherwise
        # let every later assertion pass vacuously by finding nothing.
        body_text = (page.inner_text("body") or "").strip()
        if len(body_text) < 20:
            failures.append("popup body is empty - the module did not run")
            fail(f"body has {len(body_text)} chars of text")
        else:
            ok(f"body has {len(body_text)} chars of text")

        if page_errors:
            failures.append(f"{len(page_errors)} uncaught page error(s)")
            for error in page_errors:
                fail(error)
        else:
            ok("no uncaught page errors")

        csp_violations = [c for c in console if "Content Security Policy" in c]
        if csp_violations:
            failures.append("CSP violation in the popup")
            for violation in csp_violations:
                fail(violation)
        else:
            ok("no CSP violations")

        print("\n-- localisation --")
        html_lang = page.get_attribute("html", "lang") or ""
        html_dir = page.get_attribute("html", "dir") or ""
        print(f"  html lang={html_lang!r} dir={html_dir!r}")
        expect_rtl = args.locale.split("-")[0] in {"ar", "he", "fa", "ur"}
        if expect_rtl and html_dir != "rtl":
            failures.append(f"locale {args.locale} did not produce dir=rtl")
            fail(f"dir is {html_dir!r}, expected rtl")
        elif not expect_rtl and html_dir != "ltr":
            failures.append(f"locale {args.locale} did not produce dir=ltr")
            fail(f"dir is {html_dir!r}, expected ltr")
        else:
            ok(f"dir={html_dir} for locale {args.locale}")

        # An untranslated popup is the failure this whole design exists to
        # prevent, and it looks exactly like a working one in English.
        tabs = page.eval_on_selector_all(
            ".tab", "els => els.map(e => e.textContent.trim())"
        )
        print(f"  tabs: {tabs}")
        if len(tabs) != 3 or any(len(label) == 0 for label in tabs):
            failures.append(f"expected 3 non-empty tabs, got {tabs}")
            fail("tab labels")
        else:
            ok("3 tabs, all with text")
        if args.locale != "en" and all(
            label in {"Status", "Quick Redact", "Insights"} for label in tabs
        ):
            failures.append(f"locale {args.locale} rendered the English tab labels")
            fail("no translation applied")
        elif args.locale != "en":
            ok(f"tab labels are not English ({args.locale} catalogue was used)")

        print("\n-- the tablist is a real tablist --")
        selected = page.eval_on_selector_all(
            ".tab", "els => els.map(e => e.getAttribute('aria-selected'))"
        )
        if selected != ["true", "false", "false"]:
            failures.append(f"aria-selected is {selected}")
            fail("initial aria-selected")
        else:
            ok("aria-selected starts on the first tab")

        roving = page.eval_on_selector_all(".tab", "els => els.map(e => e.tabIndex)")
        if roving != [0, -1, -1]:
            failures.append(f"roving tabindex is {roving}")
            fail("roving tabindex")
        else:
            ok("roving tabindex 0/-1/-1")

        page.focus(".tab")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(120)
        selected = page.eval_on_selector_all(
            ".tab", "els => els.map(e => e.getAttribute('aria-selected'))"
        )
        quick_hidden = page.get_attribute("#panel-quick", "hidden")
        if selected != ["false", "true", "false"] or quick_hidden is not None:
            failures.append("ArrowRight did not move the tab selection")
            fail(f"after ArrowRight: selected={selected} quick hidden={quick_hidden}")
        else:
            ok("ArrowRight selects the next tab and reveals its panel")

        print("\n-- Quick Redact --")
        # NOT an example.com/.org/.net address. Those are RFC 2606 reserved
        # names and SPEC has the email detector classify them NON-SENSITIVE on
        # purpose, so a test written with one asserts that nothing happens and
        # then reports that nothing happening was fine. A detection fixture
        # fell into exactly this in M8 (D40).
        #
        # The IBAN is checksummed, so it cannot be a false positive either way.
        secret_email = "rene.dupont@lemonde-conseil.fr"
        secret_iban = "GB33BUKB20201555555555"
        page.fill(
            "#quick-input",
            f"Write to {secret_email} and pay {secret_iban} by Friday.",
        )
        page.click(".quick-actions button")  # the first action is Mask

        # WAIT FOR THE ANSWER, DO NOT GUESS HOW LONG IT TAKES. A fixed timeout
        # raced the 6,568 ms cold model load and produced a different verdict
        # on two consecutive runs of the same code - which makes the check
        # worthless in both directions.
        try:
            page.wait_for_function(
                "() => document.querySelector('.status')?.textContent.trim().length > 0",
                timeout=45_000,
            )
        except Exception:
            failures.append("Quick Redact never reported an outcome within 45s")
            fail("no status after 45s - it neither masked nor refused")

        output = page.input_value("#quick-output")
        status = (page.inner_text(".status") or "").strip()
        tone = page.get_attribute(".status", "data-tone")
        print(f"  status: {status!r} (tone={tone})")
        print(f"  output: {output[:100]!r}")

        leaked = [v for v in (secret_email, secret_iban) if v in output]
        if leaked:
            # The one unacceptable outcome: a value survives into the text the
            # user is invited to copy and paste somewhere else.
            failures.append(f"Quick Redact output still contains {leaked}")
            fail(f"NOT masked: {leaked}")
        elif tone == "error":
            # Fail-closed. A correct outcome, and it says so rather than
            # sitting empty.
            ok(f"failed closed with a visible reason: {status!r}")
        elif len(output) == 0:
            # A FAILURE, not a pass. "Nothing sensitive was found" in a string
            # holding an address and a valid IBAN means detection ran and came
            # back empty, which is under-masking with a reassuring caption.
            failures.append(
                "Quick Redact found nothing in text containing an email and a "
                f"valid IBAN (status: {status!r})"
            )
            fail("detection ran and found nothing")
        elif output == page.input_value("#quick-input"):
            failures.append("Quick Redact returned the input unchanged")
            fail("output is identical to input")
        else:
            ok("both values are absent from the output, which differs from the input")

        print("\n-- the content script answers the popup's question --")
        # The popup can only ever see the tab it is running in, so opening
        # popup.html can never reach the supported-site path. The missing half
        # is the CONTENT SCRIPT's handler, and the service worker can address
        # it exactly as the popup does: chrome.tabs.sendMessage.
        #
        # This needs the network to LOAD the site. The extension still makes no
        # request of its own, which is what verify-live-site.py measures.
        if args.site is None:
            print("  SKIPPED (pass --site https://claude.ai/ to run it)")
            skipped.append("content-script popup-status handler")
        else:
            site_page = context.new_page()
            try:
                site_page.goto(args.site, wait_until="domcontentloaded", timeout=45_000)
                site_page.wait_for_timeout(6000)
                reply = worker.evaluate(
                    """async (url) => {
                        const tabs = await chrome.tabs.query({});
                        const tab = tabs.find((t) => (t.url || '').startsWith(url));
                        if (!tab || tab.id === undefined) return { error: 'no tab for ' + url };
                        try {
                          return await chrome.tabs.sendMessage(tab.id, { kind: 'popup-status' });
                        } catch (e) {
                          return { error: String(e) };
                        }
                    }""",
                    args.site,
                )
                print(f"  reply: {json.dumps(reply, ensure_ascii=False)[:300]}")
                if not isinstance(reply, dict) or "siteId" not in reply:
                    failures.append(f"the content script did not answer popup-status: {reply}")
                    fail("no usable reply")
                else:
                    ok(f"siteId={reply['siteId']!r} enabled={reply.get('enabled')}")
                    if "health" not in reply or "session" not in reply:
                        failures.append("the reply is missing health or session")
                        fail("incomplete reply")
                    else:
                        ok("the reply carries health and session")
                    # messages.ts: counts, timestamps and entity TYPE names
                    # only. A url or a text field here would be a leak from the
                    # page into a message that crosses process boundaries.
                    keys = set(reply.keys())
                    unexpected = keys - {"siteId", "enabled", "health", "session"}
                    if unexpected:
                        failures.append(f"unexpected fields in the reply: {unexpected}")
                        fail(f"unexpected fields: {unexpected}")
                    else:
                        ok("the reply carries only the four contracted fields")

                # ── the per-site toggle, end to end ──
                #
                # The popup writes `disabledSites`; the CONTENT SCRIPT is what
                # has to act on it. Checking that the popup wrote the setting
                # would only prove the popup works. This writes the setting the
                # way the popup does and then asks the tab what it is doing,
                # which is the only way to see the other half.
                toggled = worker.evaluate(
                    """async (url) => {
                        const tabs = await chrome.tabs.query({});
                        const tab = tabs.find((t) => (t.url || '').startsWith(url));
                        if (!tab || tab.id === undefined) return { error: 'no tab' };
                        const ask = () => chrome.tabs.sendMessage(tab.id, { kind: 'popup-status' });
                        const first = await ask();
                        await chrome.storage.local.set({
                          settings: { profile: 'balanced', mode: 'surrogate', disabledTypes: [],
                                      disabledSites: [first.siteId], allowlist: [], denylist: [],
                                      customRules: [], phoneRegion: 'US' },
                        });
                        await new Promise((r) => setTimeout(r, 800));
                        const off = await ask();
                        await chrome.storage.local.remove('settings');
                        await new Promise((r) => setTimeout(r, 800));
                        const backOn = await ask();
                        return { before: first.enabled, off: off.enabled, backOn: backOn.enabled };
                    }""",
                    args.site,
                )
                print(f"  toggle: {toggled}")
                if not isinstance(toggled, dict) or "before" not in toggled:
                    failures.append(f"the toggle round trip did not complete: {toggled}")
                    fail("no toggle result")
                elif toggled["before"] is not True or toggled["off"] is not False:
                    failures.append(f"disabling the site did not reach the tab: {toggled}")
                    fail(f"enabled went {toggled['before']} -> {toggled['off']}")
                elif toggled["backOn"] is not True:
                    # Removing the key must protect again: an absent setting is
                    # the protective default, not "still off".
                    failures.append(f"clearing the setting left the site unprotected: {toggled}")
                    fail("did not re-enable when the setting was removed")
                else:
                    ok("disabling reaches the tab, and clearing the setting re-protects it")
            finally:
                site_page.close()

        print("\n-- Insights --")
        page.bring_to_front()
        page.focus(".tab")
        page.keyboard.press("End")
        page.wait_for_timeout(200)
        insights_text = (page.inner_text("#panel-insights") or "").strip()
        if len(insights_text) == 0:
            failures.append("the Insights panel rendered nothing")
            fail("empty Insights panel")
        else:
            ok(f"Insights panel has text ({len(insights_text)} chars)")

        page.focus(".tab")
        page.keyboard.press("Home")
        page.wait_for_timeout(150)
        page.screenshot(path=str(out_dir / f"popup-{args.locale}-status.png"))
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(150)
        page.screenshot(path=str(out_dir / f"popup-{args.locale}-quick.png"))
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(150)
        page.screenshot(path=str(out_dir / f"popup-{args.locale}-insights.png"))

        context.close()

    print(f"\nscreenshots: {out_dir}")
    if skipped:
        print(f"\nNOT RUN ({len(skipped)}):")
        for name in skipped:
            print(f"  - {name}")
    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    if skipped:
        # Never "all passed" when something did not run. The summary is the
        # only line most readers see, and it must not claim coverage the run
        # did not have.
        print(f"\nPopup checks passed, with {len(skipped)} NOT RUN (listed above).")
    else:
        print("\nAll popup checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
