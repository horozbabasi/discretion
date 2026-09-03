# Chrome Web Store submission package — Discretion v0.1.0

Everything needed for the dashboard, in the order the dashboard asks for it.
The listing text itself lives in [`../../STORE-LISTING.md`](../../STORE-LISTING.md);
this file is the operational checklist and the manual walkthrough.

**This part cannot be automated.** It needs a Chrome Web Store developer
account and a one-time **$5 USD** registration fee, and the final Submit is a
human click.

---

## 1. What to upload

| item | where | notes |
| --- | --- | --- |
| **Package** | `packages/extension/discretion-0.1.0.zip` | 246,053,221 bytes (~235 MB). Rebuild with `bash packages/extension/scripts/make-store-zip.sh` |
| Icon 128×128 | `src/icons/icon128.png` | already inside the zip; the dashboard reads it from the manifest |
| Screenshot 1 | `store-assets/screenshot-review-panel-1280x800.png` | the review panel |
| Screenshot 2 | `store-assets/screenshot-quick-redact-1280x800.png` | Quick Redact |
| Screenshot 3 | `store-assets/screenshot-options-1280x800.png` | options page |
| Small promo tile 440×280 | `store-assets/promo-tile-440x280.png` | |
| Marquee 1400×560 | `store-assets/promo-marquee-1400x560.png` | optional; only used if featured |

**Verified about the package**, because each is a silent failure at the far end
of a submission:

- built from `59090cf` on `main`, working tree clean. **Not from the `v0.1.0`
  tag**: the repository history was rewritten after that tag was cut, so the
  commit it originally pointed at no longer exists. The extension code is
  unchanged - only commit SHAs and one renamed documentation file moved.
- `manifest.json` is at the **archive root**, and **no entry uses a backslash**
  — checked, because PowerShell's zip writers produce backslash separators,
  which the ZIP spec forbids
- loads in a real browser: `name=Discretion version=0.1.0 mv=3`,
  `permissions=['offscreen','storage']`, three host permissions
- 235 MB is within the store's **2 GB** package limit

## 2. Listing fields

Copy from [`../../STORE-LISTING.md`](../../STORE-LISTING.md), which holds the
final wording. Summary:

- **Name:** `Discretion — mask PII before you send`
- **Short description** (124 chars) and **detailed description**: in that file
- **Category:** Productivity (secondary: Privacy & Security if offered)
- **Language: English only.** See §5.

## 3. Privacy tab

- **Privacy policy URL:**
  `https://github.com/horozbabasi/discretion/blob/main/PRIVACY.md`
  (verified publicly reachable, HTTP 200, anonymously)
- **Single purpose:** the paragraph in STORE-LISTING.md
- **Permission justifications:** verbatim from
  [`PERMISSIONS.md`](PERMISSIONS.md) — `host_permissions` (three named
  origins), `storage`, `offscreen`
- **Data usage:** every "collect" box is **No**

> A reviewer will notice the extension plainly *reads* the categories it says
> it does not collect. STORE-LISTING.md contains the paragraph explaining the
> read/collect distinction — it reads them in page memory to mask them, and
> transmits and stores nothing. Have that ready; it is the one question this
> listing is most likely to draw.

## 4. The manual walkthrough

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the Google account that should own the listing. **This choice
   is effectively permanent** — transferring a published item later is awkward.
3. If this is your first item, pay the **one-time $5 USD** registration fee.
4. Complete **Account** → verify your email and set a publisher display name.
   An unverified account cannot publish.
5. **+ New item** → drag in `discretion-0.1.0.zip`. The upload takes a while at
   235 MB; do not close the tab.
6. **Store listing** tab → paste name, short and detailed descriptions, choose
   the category, upload the three screenshots and the promo tile.
7. **Privacy practices** tab → single purpose, the three permission
   justifications, the privacy policy URL, and set every data-collection box to
   **No**. Tick the three certification checkboxes.
8. **Distribution** tab → **Public**, all regions unless you want otherwise.
9. **Submit for review.**

Review typically takes a few days and can take longer for an extension that
requests host permissions on named sites and ships a large binary. A rejection
arrives by email with a policy reference.

## 5. Known limitations, stated for the record

These are the things a reviewer or a user could reasonably discover. None is a
defect being hidden; each is documented with reasoning in ARCHITECTURE.md.

- **English only.** Eight translated locales exist and are **deliberately not
  shipped**: no speaker of any of them has reviewed the 21 safety-critical
  strings, and the build drops any locale without a sign-off. A listing in a
  language whose UI ships in English would promise something the package does
  not do — so the listing is English-only too.
- **Two send routes remain ungated.** `form.submit()` fires no event any
  listener can observe (permanent, absent main-world injection this extension
  refuses); and a click on a control no adapter recognises is not gated,
  because the obvious fix would also intercept the STOP button and prevent a
  user from interrupting a reply.
- **Not tested with a screen reader.** The accessibility tree is audited; no
  one has driven the pages with NVDA, VoiceOver or Orca. No shipping document
  claims otherwise.
- **Trademark is not cleared** (ARCHITECTURE.md D65). No register was queried.
- **It misses things.** `GENERIC_SECRET` recall is 56.8%. The published
  numbers, including the bad ones, are in BENCHMARKS.md.
