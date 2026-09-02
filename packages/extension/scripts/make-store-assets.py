"""Generates the Chrome Web Store promotional images.

The store asks for a 440x280 small tile and, for some placements, a 1400x560
marquee. Both are built here from HTML and screenshotted at exact size, so they
are reproducible and reviewable as SOURCE rather than being binaries someone
once made in an image editor and can no longer regenerate.

VISUAL LANGUAGE comes from what already exists: the shield-with-a-keyhole
silhouette in make-icons.mjs, its ink (#1c364a) and parchment (#e8ddc8), and
the interface accent from ui/pages.css. A promotional image in a different
palette from the product is a small lie about what you are installing.

The tile shows the TRANSFORMATION rather than a slogan: a real-looking secret
becoming a stand-in. That is the whole product, and it survives being shrunk in
a store listing better than a sentence does.

THE TWO VALUES ARE MEASURED OUTPUT, not invented. `protect()` was run on that
IBAN with seed 42 and returned exactly the second one - a different German IBAN
that passes the same mod-97 checksum, which is what "format-preserving" means
and what the image is claiming.

The first draft showed `sk_live_...` becoming another `sk_live_...`, and that
was a misrepresentation: API_KEY surrogates are drawn from the whole provider
pool, so a Stripe key is actually replaced by a Google or npm or Hugging Face
one. Checked before shipping the image rather than after. An IBAN and a card
number really are replaced in kind; an API key is not.

Python rather than Node because every other browser-driving script in this
repository is Python Playwright, and adding the Node package would pull a
second browser download for one image.

Usage:
  python packages/extension/scripts/make-store-assets.py
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = Path(__file__).resolve().parent.parent / "store-assets"

INK = "#1c364a"
PARCHMENT = "#e8ddc8"
ACCENT = "#7fb2e0"


def shield(size: float) -> str:
    """The icon's silhouette, so the tile and the toolbar agree."""
    return f"""
    <svg viewBox="0 0 100 100" width="{size}" height="{size}" aria-hidden="true">
      <path d="M8 6 H92 V45 Q92 78 50 97 Q8 78 8 45 Z" fill="{PARCHMENT}"/>
      <path d="M13 11 H87 V45 Q87 74 50 91 Q13 74 13 45 Z" fill="none" stroke="{INK}" stroke-width="3"/>
      <rect x="43" y="30" width="14" height="42" rx="7" fill="{INK}"/>
    </svg>"""


def document(width: int, height: int, scale: float) -> str:
    def s(n: float) -> str:
        return f"{n * scale:.2f}px"

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=IBM+Plex+Mono:wght@500&display=swap');
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {width}px; height: {height}px; overflow: hidden; }}
  body {{
    background: radial-gradient(120% 90% at 12% 0%, #2a4c66 0%, {INK} 55%, #142838 100%);
    color: {PARCHMENT};
    font-family: 'Source Serif 4', Georgia, serif;
    display: flex; align-items: center;
    padding: {s(30)}; gap: {s(26)}; position: relative;
  }}
  /* A faint rule grid: texture without pattern noise, and it reads as paper. */
  body::before {{
    content: ''; position: absolute; inset: 0; opacity: .07;
    background: repeating-linear-gradient(to bottom, {PARCHMENT} 0 1px, transparent 1px {s(11)});
  }}
  .mark {{ flex: 0 0 auto; display: flex; align-items: center; position: relative; }}
  .body {{ position: relative; display: flex; flex-direction: column; gap: {s(11)}; min-width: 0; }}
  h1 {{ font-size: {s(34)}; font-weight: 700; letter-spacing: {s(-0.6)}; line-height: 1.05; white-space: nowrap; }}
  p.tag {{ font-size: {s(14.5)}; line-height: 1.35; color: #c8d6e4; max-width: {s(300)}; }}
  .demo {{
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: {s(12.5)}; display: flex; flex-direction: column; gap: {s(5)}; margin-top: {s(2)};
  }}
  .row {{ display: flex; align-items: center; gap: {s(9)}; white-space: nowrap; }}
  .label {{
    font-family: 'Source Serif 4', Georgia, serif; font-size: {s(10.5)};
    letter-spacing: {s(0.8)}; text-transform: uppercase; color: #8fa6ba;
    width: {s(58)}; flex: 0 0 auto;
  }}
  .val {{ padding: {s(3)} {s(8)}; border-radius: {s(4)}; }}
  .before {{
    background: rgba(232,221,200,.09); color: #f0e6d2; text-decoration: line-through;
    text-decoration-color: #d8734f; text-decoration-thickness: {s(1.5)};
  }}
  .after {{
    background: rgba(127,178,224,.16); color: {ACCENT};
    border: {s(1)} solid rgba(127,178,224,.35);
  }}
  .foot {{
    position: absolute; right: {s(30)}; bottom: {s(20)};
    font-size: {s(11)}; color: #7e94a8; letter-spacing: {s(0.3)};
  }}
</style></head><body>
  <div class="mark">{shield(96 * scale)}</div>
  <div class="body">
    <h1>Discretion</h1>
    <p class="tag">Masks passwords, keys and ID numbers before they reach ChatGPT, Claude or Gemini.</p>
    <div class="demo">
      <div class="row"><span class="label">You type</span>
        <span class="val before">DE44500105175407324931</span></div>
      <div class="row"><span class="label">They get</span>
        <span class="val after">DE47770612720573428586</span></div>
    </div>
  </div>
  <div class="foot">Runs on your device &middot; no network requests</div>
</body></html>"""


def framed_screenshot(png: Path, caption: str, subtitle: str, shot_width: int, scale: float) -> str:
    """A 1280x800 store screenshot: the real panel, on an abstract backdrop.

    The backdrop is deliberately NOT a mock chat interface. A panel composited
    over something that resembles ChatGPT would be a picture of the product
    running somewhere it never ran, which is the same objection that keeps
    make-panel-screenshot.py cropped to the panel itself.
    """
    data = base64.b64encode(png.read_bytes()).decode("ascii")

    def s(n: float) -> str:
        return f"{n * scale:.2f}px"

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
  @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap');
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: 1280px; height: 800px; overflow: hidden; }}
  body {{
    background: radial-gradient(120% 90% at 50% -10%, #2a4c66 0%, {INK} 60%, #142838 100%);
    color: {PARCHMENT}; font-family: 'Source Serif 4', Georgia, serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: {s(28)}; padding: {s(48)}; position: relative;
  }}
  body::before {{
    content: ''; position: absolute; inset: 0; opacity: .06;
    background: repeating-linear-gradient(to bottom, {PARCHMENT} 0 1px, transparent 1px {s(11)});
  }}
  h2 {{
    position: relative; font-size: {s(30)}; font-weight: 700; text-align: center;
    letter-spacing: {s(-0.4)}; line-height: 1.2; max-width: {s(760)};
  }}
  .shot {{
    position: relative; width: 100%; max-width: {s(1000)};
    border-radius: {s(10)}; overflow: hidden;
    box-shadow: 0 {s(18)} {s(50)} rgba(0,0,0,.45), 0 0 0 {s(1)} rgba(232,221,200,.18);
  }}
  .shot img {{ display: block; width: 100%; }}
  p.sub {{
    position: relative; font-size: {s(15)}; color: #a8bccd; text-align: center;
    max-width: {s(720)}; line-height: 1.45;
  }}
</style></head><body>
  <h2>{caption}</h2>
  <div class="shot"><img src="data:image/png;base64,{data}" alt=""></div>
  <p class="sub">{subtitle}</p>
</body></html>"""


TARGETS = [
    ("promo-tile-440x280.png", 440, 280, 1.0),
    ("promo-marquee-1400x560.png", 1400, 560, 2.6),
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    with sync_playwright() as p:
        # channel="msedge": the same system browser every other
        # verify-*.py in this repo drives. Playwright's own chromium is not
        # provisioned here, and provisioning it for one image is not a trade
        # worth making.
        browser = p.chromium.launch(channel="msedge")
        for name, width, height, scale in TARGETS:
            context = browser.new_context(
                viewport={"width": width, "height": height}, device_scale_factor=1
            )
            page = context.new_page()
            page.set_content(document(width, height, scale), wait_until="load")
            # Webfonts arrive asynchronously. Screenshotting before they land
            # gives a serif fallback and a silently different image every run.
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(600)

            # The fonts come from Google Fonts over the network. If they did
            # not arrive, the page renders in a fallback serif and the image is
            # SILENTLY different from the intended one - the kind of failure
            # that only shows up when someone compares two tiles months apart.
            loaded = page.evaluate(
                "() => ({"
                " serif: document.fonts.check('700 34px \"Source Serif 4\"'),"
                " mono: document.fonts.check('500 13px \"IBM Plex Mono\"')})"
            )
            if not (loaded["serif"] and loaded["mono"]):
                print(f"  FAIL  {name}: webfonts did not load ({loaded}).")
                print("        The image would render in a fallback face; not writing it.")
                context.close()
                failures.append(name)
                continue
            path = OUT / name
            page.screenshot(path=str(path))
            print(f"  wrote {path.name}  ({width}x{height})")
            context.close()

        # The 1280x800 store screenshots, framed from real captures.
        #
        # RAW captures come from verify-popup.py / verify-options.py, which
        # take them at the sizes the surfaces actually are (380x600 popup,
        # 900x900 options). The store wants 1280x800, so they are placed on the
        # product's own backdrop rather than upscaled - a 380px-wide PNG
        # stretched to 1280 looks exactly as bad as it is.
        FRAMED = [
            ("review-panel.png", "You see exactly what will be replaced, before anything is sent.",
             "Every item is listed with a calibrated confidence and the evidence that triggered it. "
             "Keep any of them unmasked, one at a time. Nothing is sent until you decide.",
             "screenshot-review-panel-1280x800.png", 1000),
            # NO popup-Status FRAME, deliberately.
            #
            # verify-popup.py opens the popup against a chrome-extension:// page,
            # where the extension correctly reports "does not run on this site"
            # and the Status panel deliberately shows the Quick Redact pitch
            # instead (see renderStatus). Framing that under a caption like
            # "whether this page is protected" would sell the product with a
            # picture of it doing nothing.
            #
            # An honest "Protecting this page" capture needs the popup opened
            # while a SUPPORTED site is the active tab, which this harness
            # cannot arrange: the popup asks the active tab who it is, and a
            # popup.html opened directly is its own tab. Left undone rather
            # than faked.
            ("raw/popup-en-quick.png", "Quick Redact: mask text for anywhere else.",
             "Paste text from any app. The masked version is safe to send, and pasting a reply "
             "back restores the real values. Nothing leaves your device.",
             "screenshot-quick-redact-1280x800.png", 420),
            # The caption names what is VISIBLE in the crop. The first version
            # said "34 detectors you can switch off individually" over a
            # screenshot showing sensitivity profiles and replacement style -
            # true of the page, not of the picture.
            ("raw/options-en.png", "Choose how much it catches, and what it leaves alone.",
             "Sensitivity profiles, per-type toggles, an allowlist and denylist, and custom rules "
             "with a live tester. All stored on your device.",
             "screenshot-options-1280x800.png", 820),
        ]
        for source_name, caption, subtitle, out_name, width in FRAMED:
            source = OUT / source_name
            if not source.exists():
                print(f"  SKIP  {out_name}: {source_name} is missing")
                print("        Run make-panel-screenshot.py, verify-popup.py --out and")
                print("        verify-options.py --out first.")
                failures.append(f"{source_name} missing")
                continue
            context = browser.new_context(
                viewport={"width": 1280, "height": 800}, device_scale_factor=1
            )
            page = context.new_page()
            page.set_content(
                framed_screenshot(source, caption, subtitle, width, 1.0), wait_until="load"
            )
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / out_name))
            print(f"  wrote {out_name}  (1280x800)")
            context.close()

        browser.close()
    print()
    if failures:
        print(f"FAILED for {len(failures)}: {', '.join(failures)}")
        return 1
    print(f"store assets in {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
