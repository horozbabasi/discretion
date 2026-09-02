# Privacy policy

**Discretion browser extension**

Last updated: 3 September 2026

---

## The short version

**Discretion does not collect, transmit, or store your data. It makes no
network requests of any kind after it is installed.**

There is no account, no sign-in, no server, and no analytics. Nothing you type
is sent anywhere by this extension.

The rest of this document explains what the extension *does* touch, and why
the answer to every "do you collect X" question is no.

---

## What the extension reads

To do its job, Discretion reads the text you type or paste into the message
box on three websites:

- `chatgpt.com`
- `claude.ai`
- `gemini.google.com`

It reads that text **in your browser's memory**, in order to find sensitive
values in it and replace them before the message is sent. It also reads the
replies those sites stream back, so that masked values can be turned back into
your real ones on screen.

**Reading is not collecting.** The text is never transmitted, never written to
disk, and never leaves the tab it was typed in.

## What the extension stores

Two things, both on your own device, both in the browser's extension storage:

**1. Your settings.** Sensitivity profile, which entity types are switched on,
replacement mode, your allowlist and denylist, your configured region, and any
custom detection rules you add.

**2. Local Insights counters.** A count of how many items of each *category*
were masked, per month — for example "credentials: 12, financial: 3, in August
2026".

These counters contain **no values, no text, no site names, and no
timestamps** beyond the month. They cannot be used to reconstruct anything you
typed. You can reset them at any time from the extension's popup, and
uninstalling the extension deletes them.

## What the extension never stores

- The original text of any message.
- Any detected value — no card number, password, API key, name, address, or
  identifier.
- Which site you were on, or when.
- Any browsing history, page content outside the message box, or activity on
  any other site.

Original values are held in memory only, for as long as the tab session lasts,
so that masked replies can be restored. They are discarded when you navigate
away or close the tab. They are never written to `storage.local`,
`localStorage`, `IndexedDB`, cookies, or any file.

## Network requests

**None.** After installation, Discretion makes no outbound network request
of any kind — not for detection, not for telemetry, not for crash reports, not
to update a word list, not to check for a licence.

Everything the extension needs, including the multilingual language model it
uses to recognise names and places, is bundled into the extension package at
build time and runs on your device.

This is enforced, not merely promised: the extension's Content Security Policy
restricts connections to itself (`connect-src 'self'`), the packaged code is
open source and auditable, and the project's automated checks include a test
that runs detection with the browser's network functions replaced by ones that
throw.

## Third parties

There are none. No analytics provider, no error-reporting service, no CDN, no
advertising, no A/B testing, and no third-party SDK of any kind is included in
the extension.

We do not sell, share, rent, or transfer your data to anyone, because we never
receive it.

## Permissions, and why each is needed

| permission | why |
| --- | --- |
| Access to `chatgpt.com`, `claude.ai`, `gemini.google.com` | To read and rewrite the message box on those three sites. The extension cannot work on a site it is not allowed to script. These three are named individually rather than requesting access to all websites. |
| `storage` | To save your settings and the values-free Insights counters on your device. |
| `offscreen` | The language model runs as WebAssembly, which the chat sites' own security policies prevent from running inside their pages. An offscreen document is a hidden page belonging to the extension where it can run. Your text travels to it over an internal channel inside your browser and does not leave. |

The extension does **not** request permission to read your browsing history,
your tabs, your bookmarks, your downloads, your clipboard, or any site other
than the three named above.

## Quick Redact

The popup includes a box you can paste any text into to have it masked, for
use anywhere else. That text is processed in the popup, in memory, on your
device. It is not stored and not transmitted. Closing the popup discards it.

## Children

The extension is not directed at children and collects no information from
anyone, including children.

## Your rights

Data-protection law gives people rights to access, correct, export, and delete
personal data held about them. **We hold no personal data about you**, so
there is nothing for us to disclose, correct, export, or delete.

The data on your own device is yours: the settings and counters can be viewed,
changed, and reset from the extension's options and popup pages, and are
removed entirely when you uninstall the extension.

## Changes to this policy

If this policy changes, the updated version will be published at the same
address with a new "last updated" date, and the change will be recorded in the
project's public commit history.

Because the extension makes no network requests, a policy change can never be
applied retroactively to data already collected — there is none.

## Contact

Questions, or a report of anything in the extension that contradicts this
policy:

- Issues: <https://github.com/horozbabasi/discretion/issues>
- Source: <https://github.com/horozbabasi/discretion>

The full technical security model, including the threat model and the things
the extension deliberately does **not** protect against, is in
[SECURITY.md](SECURITY.md).

## What this policy does not claim

For honesty, and because a privacy policy that only lists strengths is not
informative:

- Discretion **will miss sensitive values**. It is a safety net, not a
  guarantee, and it is not a compliance control.
- It does not protect files, images, or screenshots you attach to a message.
- The site can see what is in the message box while you type. Only what you
  **send** is masked.
- It protects against accidental disclosure by you. It is not a defence
  against a malicious website actively trying to extract your data.
