"""Loads the built extension and drives its options page in a real browser.

The properties worth checking here are the ones a settings page gets wrong
quietly:

  - a control that LOOKS applied and did not persist. Every assertion below
    reads the value back out of chrome.storage after acting on the control,
    not out of the DOM.
  - an import that trusts the file. `parseSettings` is supposed to discard
    what it cannot recognise, and a settings file is the one input a user is
    invited to accept from a stranger.
  - a page that renders in English for a translated browser.

Usage:
  python scripts/verify-options.py [--locale tr] [--out DIR]
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


def fail(message: str) -> None:
    print(f"  FAIL  {message}")


def ok(message: str) -> None:
    print(f"  ok    {message}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--locale", default="en")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    if not (BUILD / "manifest.json").exists():
        print("build/ is missing. Run: npm run ext:build")
        return 2

    out_dir = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="ps-options-"))
    out_dir.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    not_run: list[str] = []
    profile = Path(tempfile.mkdtemp(prefix="ps-profile-"))

    with sync_playwright() as p:
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

        worker = None
        for existing in context.service_workers:
            worker = existing
            break
        if worker is None:
            worker = context.wait_for_event("serviceworker", timeout=15_000)
        extension_id = re.sub(r"^chrome-extension://([a-z]+)/.*$", r"\1", worker.url)

        page_errors: list[str] = []
        console: list[str] = []
        page = context.new_page()
        page.set_viewport_size({"width": 900, "height": 900})
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
        page.goto(f"chrome-extension://{extension_id}/options.html")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        def stored() -> dict:
            """Whatever is actually on disk, not whatever the DOM shows."""
            return worker.evaluate(
                "async () => (await chrome.storage.local.get('settings')).settings ?? null"
            )

        print("\n-- the page rendered --")
        body_text = (page.inner_text("body") or "").strip()
        if len(body_text) < 200:
            failures.append("options body is nearly empty - the module did not run")
            fail(f"body has {len(body_text)} chars")
        else:
            ok(f"body has {len(body_text)} chars of text")

        if page_errors:
            failures.append(f"{len(page_errors)} uncaught page error(s)")
            for error in page_errors:
                fail(error)
        else:
            ok("no uncaught page errors")

        csp = [c for c in console if "Content Security Policy" in c]
        if csp:
            failures.append("CSP violation on the options page")
            for violation in csp:
                fail(violation)
        else:
            ok("no CSP violations")

        print("\n-- every entity type is offered --")
        boxes = page.eval_on_selector_all(".types input[type=checkbox]", "els => els.length")
        # 35 members of EntityType, MINUS the ones nothing can detect.
        # DATE_OF_BIRTH is in the union deliberately (SPEC's Strict profile and
        # substitution table need it) but has no Stage 1 detector and is not
        # emitted by Stage 2, so offering a toggle for it would be a control
        # that changes nothing in either position. A silently SHORT list is
        # still a bug - a type nobody can switch off looks identical to one
        # nobody wants to - so the count is pinned rather than loosened.
        EXPECTED = 34
        if boxes != EXPECTED:
            failures.append(f"expected {EXPECTED} type checkboxes, found {boxes}")
            fail(f"{boxes} type checkboxes")
        else:
            ok(f"{EXPECTED} type checkboxes (35 EntityTypes less DATE_OF_BIRTH, undetectable)")

        print("\n-- a change actually persists --")
        before = stored()
        page.select_option("#region", "TR")
        page.wait_for_timeout(400)
        after = stored()
        if not isinstance(after, dict) or after.get("phoneRegion") != "TR":
            failures.append(f"phoneRegion did not persist: {after}")
            fail(f"stored phoneRegion is {after.get('phoneRegion') if isinstance(after, dict) else after!r}")
        else:
            ok("phoneRegion=TR reached chrome.storage")

        # A type toggle, read back from storage rather than from the checkbox.
        first_box = page.locator(".types input[type=checkbox]").first
        first_box.uncheck()
        page.wait_for_timeout(400)
        after = stored()
        disabled = after.get("disabledTypes") if isinstance(after, dict) else None
        if not disabled:
            failures.append("unchecking a type did not persist")
            fail(f"disabledTypes is {disabled!r}")
        else:
            ok(f"disabledTypes persisted: {disabled}")

        print("\n-- the live tester runs the real engine --")
        page.fill("#rule-tester", "abc 123 def 456")
        page.wait_for_timeout(200)
        # No rules yet, so zero matches - and it must SAY zero rather than
        # stay blank, or an empty result is indistinguishable from a broken one.
        tester_status = page.eval_on_selector(
            "#rule-tester ~ .status", "e => e.textContent.trim()"
        )
        if len(tester_status) == 0:
            failures.append("the live tester reported nothing at all")
            fail("empty tester status")
        else:
            ok(f"tester reports {tester_status!r} with no rules")

        page.fill(".rule input[type=text]:not(.mono)", "digits")
        page.fill(".rule input.mono", r"\d+")
        page.click(".rule button.primary")
        page.wait_for_timeout(400)
        page.fill("#rule-tester", "abc 123 def 456")
        page.wait_for_timeout(300)
        tester_status = page.eval_on_selector(
            "#rule-tester ~ .status", "e => e.textContent.trim()"
        )
        if "2" not in tester_status:
            failures.append(f"the tester did not count 2 matches: {tester_status!r}")
            fail(f"tester says {tester_status!r}")
        else:
            ok(f"tester counted the matches: {tester_status!r}")

        print("\n-- an invalid pattern is refused at the input --")
        page.fill(".rule input.mono", "(unclosed")
        page.wait_for_timeout(200)
        invalid = page.get_attribute(".rule input.mono", "aria-invalid")
        rules_before = len((stored() or {}).get("customRules", []))
        page.click(".rule button.primary")
        page.wait_for_timeout(300)
        rules_after = len((stored() or {}).get("customRules", []))
        if invalid != "true":
            failures.append("an uncompilable pattern was not marked aria-invalid")
            fail(f"aria-invalid is {invalid!r}")
        else:
            ok("aria-invalid=true on an uncompilable pattern")
        if rules_after != rules_before:
            failures.append("an uncompilable pattern was stored anyway")
            fail(f"rules went {rules_before} -> {rules_after}")
        else:
            ok("it was not stored")

        print("\n-- localisation --")
        # THE REVIEW GATE CHANGES WHAT THIS CAN ASSERT. A locale now ships
        # only once a speaker has signed off its safety-critical strings;
        # everything unreviewed is dropped and chrome.i18n falls back to
        # English. So asking for --locale ar renders an ENGLISH page, and the
        # old assertions ("dir must be rtl", "the title must not be English")
        # would fail on a correct build.
        #
        # Deleting them would be worse: they are the only browser-level check
        # that RTL layout and translation loading work at all. The shipped set
        # is read from the build instead, and the checks report NOT RUN when
        # their subject is absent - a missing check must not read as a passing
        # one.
        shipped = {d.name for d in (BUILD / "_locales").iterdir() if d.is_dir()}
        requested = args.locale.replace("-", "_")
        locale_shipped = requested in shipped or requested.split("_")[0] in shipped

        html_dir = page.get_attribute("html", "dir") or ""
        title = page.inner_text("#title").strip()
        print(f"  shipped locales: {sorted(shipped)}")
        print(f"  title: {title!r}")

        if len(title) == 0:
            failures.append("the title is empty")
            fail("empty title")
        else:
            ok("title has text")

        if not locale_shipped:
            not_run.append(
                f"RTL layout and translation loading for {args.locale!r} - that locale is "
                f"not in the build (unreviewed, see docs/translation-review/), so the page "
                f"correctly fell back to English"
            )
            # What CAN still be checked: the fallback must be coherent. English
            # text in an RTL layout was a real defect this found - isRtl() read
            # the browser UI language rather than the locale that loaded.
            if html_dir != "ltr":
                failures.append(f"fell back to English but dir={html_dir!r}, not ltr")
                fail(f"dir={html_dir!r} with English text - direction is not following the words")
            else:
                ok("English fallback renders ltr, so direction follows the loaded locale")
        else:
            expect_rtl = args.locale.split("-")[0] in {"ar", "he", "fa", "ur"}
            want = "rtl" if expect_rtl else "ltr"
            if html_dir != want:
                failures.append(f"dir is {html_dir!r}, expected {want!r}")
                fail(f"dir={html_dir!r}")
            else:
                ok(f"dir={html_dir}")
            if args.locale != "en" and title == "PrivacyShield settings":
                failures.append(f"locale {args.locale} rendered the English title")
                fail("no translation applied")
            else:
                ok("a translated title was rendered")

        page.screenshot(path=str(out_dir / f"options-{args.locale}.png"), full_page=True)
        context.close()

    print(f"\nscreenshots: {out_dir}")
    if not_run:
        # M10's convention, added after a run printed "All popup checks passed"
        # while a requested check was silently absent. A skipped check has to
        # be visible, or a shrinking suite looks like a passing one.
        print()
        print(f"NOT RUN ({len(not_run)}):")
        for skipped in not_run:
            print(f"  - {skipped}")
    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print()
    # The summary line carries the caveat: a reader who sees only the last
    # line must not read a partial run as a complete one.
    print("All options checks passed." if not not_run
          else f"All options checks that RAN passed - {len(not_run)} not run, listed above.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
