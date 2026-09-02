# Chrome Web Store listing — draft

Everything a submission needs, in the fields the dashboard asks for. Numbers
here are measured and cross-referenced to where they were measured; nothing is
rounded in the product's favour.

Written to be **submittable as-is except for the three blockers listed at the
bottom**, which are real and must not be quietly skipped.

---

## Name

```
Discretion — mask PII before you send
```

45 characters. The em-dash half is what a reader scanning a search results
page actually needs; "Discretion" alone says nothing about what it does.

## Short description (132 char limit)

```
Finds passwords, keys, card and ID numbers in what you type into ChatGPT, Claude and Gemini — and masks them before you send.
```

124 characters. Names the three sites, because "AI chat" is vague and the
permission list will name them anyway; a reader who finds that out at the
permission prompt rather than in the description has been surprised.

## Category

`Productivity` — with `Privacy & Security` as the secondary if the dashboard
allows one. Not `Developer Tools`: the detector list is broader than secrets,
and a lawyer pasting a client's ID number is as much the audience as an
engineer pasting an API key.

## Detailed description

```
Discretion checks what you type or paste into ChatGPT, Claude and Gemini,
and replaces sensitive values with realistic stand-ins before the message is
sent. You see exactly what it found and decide, one item at a time.

Everything runs on your device. The extension makes no network requests of any
kind after it is installed — not for detection, not for telemetry, not for
updates to a word list. There is nothing to sign in to and no account to
create.


WHAT IT FINDS

Credentials and secrets — API keys, private keys, JWTs, connection strings,
passwords in URLs.

Financial — card numbers (Luhn-checked), IBANs, SWIFT/BIC, routing and sort
codes, crypto wallet addresses.

Identity and documents — national ID and tax numbers, VAT numbers, passport
MRZ lines, driving licences, VINs.

Contact and location — email addresses, phone numbers (parsed, not
regex-guessed), postal addresses, coordinates, IP and MAC addresses.

Names, organisations and places — through a multilingual model that runs
locally, so it works in languages a word list would miss.

Health information.


HOW IT DECIDES

Every identifier is validated, not just pattern-matched: a card number has to
pass its checksum, an IBAN has to pass its own, a phone number has to parse as
a real number in some country. Then the surrounding text is scored — "test key"
and a documentation example are treated differently from the same string in a
sentence about production.

Each finding is shown with a confidence figure that has been calibrated
against a held-out set, so 80% means roughly 80%, and an explanation of which
evidence fired.


IF IT CANNOT CHECK, IT STOPS THE MESSAGE

If detection fails, times out, or the page changes so the extension can no
longer find the composer, the send is blocked and you are told why. It never
decides that not being able to look is the same as finding nothing.


QUICK REDACT — for everywhere else

The popup has a box you can paste any text into. It comes back masked, ready
to copy into an email, a ticket, Slack, anywhere. Paste the reply back and the
real values are restored.

This is why the extension asks for permission on three sites and not on the
whole web: the tool is useful everywhere without watching everywhere.


LOCAL INSIGHTS

A running count of what you have protected, by category, by month. Counts
only — never the values, never the text, never which site. Resettable, and
stored on your device.


WHAT IT DOES NOT DO

It does not protect files, images or screenshots you attach.

It does not protect anything you send from another app, unless you mask it
with Quick Redact first.

The site can see what is in the box while you type. Only what you SEND is
masked.

It will miss things and it will flag harmless ones. Read the review panel
before you send.

It is not a certified security product and makes no compliance guarantee.


SIZE

The download is about 364 MB, almost all of it the multilingual model. That is
a deliberate trade: the model runs on your device, so it has to be on your
device. A smaller model was measured and was 26 F1 points worse.


OPEN SOURCE

Source, the full measured evaluation, and the reasoning behind every design
decision: https://github.com/horozbabasi/discretion
```

## Privacy practices disclosures

### Single purpose

```
Detect sensitive information in text a user is about to send to a supported AI
chat service, and replace it with masked stand-ins before the message leaves
the browser.
```

### Permission justifications

Verbatim from `packages/extension/PERMISSIONS.md`, which was written at M9 for
this purpose rather than reconstructed now.

| permission | justification |
| --- | --- |
| `host_permissions` on `chatgpt.com`, `claude.ai`, `gemini.google.com` | The extension inspects and rewrites the text a user is about to send on these three chat services, which requires reading and modifying the page's composer element. It cannot work on a site it cannot script. Three named origins rather than a broad match, because minimal permissions is the trust claim this product depends on. |
| `storage` | Stores the user's own settings — sensitivity profile, per-entity toggles, replacement mode, allowlist and denylist — and the values-free Local Insights counters. No detected values, no message text, and no per-site activity are ever written. |
| `offscreen` | Detection includes a local multilingual NER model that executes WebAssembly. A content script cannot compile WebAssembly under the host pages' Content Security Policy, so the model runs in an offscreen document. The user's text travels to it on a named port inside the extension and never leaves the browser. |

### Data usage

Every box is **No**:

- Does not collect personally identifiable information
- Does not collect health information
- Does not collect financial and payment information
- Does not collect authentication information
- Does not collect personal communications
- Does not collect location
- Does not collect web history
- Does not collect user activity
- Does not collect website content

**This needs a word of explanation to a reviewer, because the extension plainly
READS all of the above.** It reads them in page memory in order to mask them,
and it does not COLLECT them: nothing is transmitted, and nothing is written to
disk. The one thing that persists is a count per category per month, which
carries no values, no text and no site. The distinction is the whole product,
and it is verifiable from source.

### Certifications

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

All three are true by construction: there is no network egress to sell
anything over.

## Assets

All generated from source and reproducible:
`python packages/extension/scripts/make-store-assets.py` (after
`make-panel-screenshot.py`). They live in `packages/extension/store-assets/`.

| asset | state |
| --- | --- |
| Icon 128x128 | present (`packages/extension/src/icons/icon128.png`) |
| Promotional tile 440x280 | **DONE** — `promo-tile-440x280.png` |
| Marquee 1400x560 | **DONE** — `promo-marquee-1400x560.png` |
| Screenshot — the review panel, 1280x800 | **DONE** — `screenshot-review-panel-1280x800.png` |
| Screenshot — popup, Status | have at 380x600 from `verify-popup.py --out`; needs the same 1280x800 framing |
| Screenshot — options page | have at 900x900; same |
| Demo video | optional; not planned for first submission |

### What the promotional images claim, and why they can

The tile shows an IBAN becoming a different IBAN. **Those two values are
measured output**, not a designer's illustration: `protect()` was run on the
first with seed 42 and returned the second, which passes the same mod-97
checksum.

The first draft showed `sk_live_...` becoming another `sk_live_...` and was
withdrawn, because it was not true — API_KEY surrogates are drawn from the
whole provider pool, so a Stripe key is actually replaced by a Google, npm or
Hugging Face one. An IBAN and a card number really are replaced in kind; an API
key is not.

### The review-panel screenshot is cropped, deliberately

It shows the panel and nothing else: no page behind it, no URL bar, no site
chrome.

The content script only activates on the three matched origins, so rendering
the panel at all means serving a fixture from one of them. A full-page capture
taken that way would show a browser at `chatgpt.com` displaying a page that is
not ChatGPT — a fabricated record of the product running somewhere it did not,
however genuine the panel in it happens to be.

The panel itself is entirely real: three detections from the real engine, with
its calibrated confidences (98%, 95%, 95%), its own explanations, and the
exposure score it computed.

**A screenshot of the panel over an actual signed-in conversation still needs a
person with an account.** It cannot be automated and must not be faked.

## Support and links

| field | value |
| --- | --- |
| Homepage | `https://github.com/horozbabasi/discretion` |
| Support | `https://github.com/horozbabasi/discretion/issues` |
| Privacy policy | **BLOCKED.** `PRIVACY.md` is written, but the repository is PRIVATE, so the URL returns 404 to anyone but the owner. Measured, not assumed: an anonymous `git ls-remote` is refused and the repo root returns HTTP 404. |

---

## Blockers before this can actually be submitted

Listed here rather than left for the submission to discover.

1. **THE REPOSITORY IS PRIVATE, and most of this listing depends on it not
   being.** Found by fetching the privacy-policy URL rather than by trusting
   the entry that said it was done: the repo root, the raw README and
   `PRIVACY.md` all return **HTTP 404** to an unauthenticated request, and
   `git ls-remote` without credentials is refused.

   What that breaks, all of it reviewer-visible:

   - the **privacy policy URL**, which the store requires;
   - the **homepage** and **support** links in this listing;
   - the "OPEN SOURCE" paragraph of the detailed description, which invites the
     reader to inspect source they cannot reach;
   - every `github.com` link in `packages/core/README.md`, which would ship to
     npm as dead links.

   **Either make the repository public, or host the privacy policy somewhere
   public and remove the source-inspection claims.** Making it public is the
   option consistent with what the listing already says about itself.

   This also qualifies an M11 result: `verify-fresh-clone.sh` passed because
   `git clone` used the local credential helper. It proved the build works from
   a clean tree; it did not prove a stranger can obtain the source. The script
   now checks and reports that distinction.

2. **Translations: eight locales are unreviewed and NOT SHIPPED.** Not a
   blocker on the submission - a decision already taken and enforced in the
   build. `_locales/en` ships alone and a Turkish user gets an English UI via
   `default_locale`.

   The listing must therefore be **English-only at first submission**: a
   localised listing would promise a localised product. Review sheets are ready
   in `docs/translation-review/` (21 strings, ~254 words per locale).

3. ~~The review-panel screenshot and the promotional tile.~~ **RESOLVED**, with
   the caveat above about what the panel screenshot does and does not depict.
   Popup and options screenshots still need the same 1280x800 framing.

### Still genuinely open

- ~~The `isComposing` Enter is unverified.~~ **ANSWERED 2026-09-03: all three
  sites wait correctly.** A composing Enter commits the IME candidate and does
  not submit, on ChatGPT, Claude and Gemini, so the adapters' existing skip is
  correct. Measured against real signed-in sessions with trusted composition
  events; see ARCHITECTURE.md D63.

- `form.submit()` cannot be intercepted by any listener (ARCHITECTURE.md D57b),
  and a click on a control no adapter recognises is not gated. Neither is a
  submission blocker, but a reviewer reading the source will find both.

- Not tested with a screen reader. The accessibility TREE is audited; nobody
  has driven the pages with NVDA, VoiceOver or Orca. No shipping document
  claims otherwise, which is what keeps this a limitation rather than a false
  claim.
