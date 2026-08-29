# Permission justifications

Written at M9, while the reasoning is fresh, rather than reconstructed at M11
for the store listing. Chrome Web Store review asks for a justification per
permission; these are those justifications, and they double as the record of
why the manifest is as narrow as it is.

The governing constraint is SPEC's first non-negotiable: **zero runtime network
access**. Several permissions a privacy extension might plausibly ask for are
absent specifically because asking for them would weaken a claim the product
is built on.

## `host_permissions` — exactly three origins

```
https://chatgpt.com/*
https://claude.ai/*
https://gemini.google.com/*
```

**Justification.** The extension inspects and rewrites the text a user is about
to send on these three chat services, which requires reading and modifying the
page's composer element. It cannot work on a site it cannot script.

**Why not `<all_urls>`.** A broad host permission would be simpler to maintain
and would make the extension work on future sites without an update. It is
refused because "this extension can read every page you visit" is a materially
different trust claim from "this extension runs on three named sites", and the
narrower claim is verifiable by a reviewer reading the manifest. The
[non-goals](../../SPEC.md) record additional chat sites as roadmap rather than
scope for the same reason.

**How users get protection elsewhere without widening this.** Quick Redact in
the popup (M10) accepts pasted text from any destination — email, tickets,
Slack — and masks it with the same engine, using **no additional host
permissions at all**. Usefulness everywhere and a three-site permission claim
are not in tension; that was a deliberate design choice.

## `permissions: ["storage"]` — settings, and nothing else

**Justification.** Stores the user's own settings: sensitivity profile,
per-entity toggles, surrogate-versus-token mode, allowlist and denylist, and
the values-free Local Insights counters (M10).

**What is never stored.** No detected values, no message text, no
conversation content. SPEC's third non-negotiable forbids plaintext
persistence, and Local Insights satisfies it by construction — it records
*counts by category*, never the values counted. The unmask vault lives in
memory only, scoped per tab session, and is cleared on navigation.

**Why not `unlimitedStorage`.** Settings and counters are kilobytes. Asking
for more would be unjustifiable. The NER model is large, but it ships inside
the package and is read from there; nothing writes it to storage.

## `permissions: ["offscreen"]` — where the model runs

**Justification.** Detection includes a local multilingual NER model
(Stage 2), which executes WebAssembly. **A content script cannot compile
WebAssembly when the host page ships a Content-Security-Policy**, and all three
target sites do. An offscreen document is the only context in which the
extension controls its own CSP, so it is the only place the model can run
on-device. Without it the choice is not "run it somewhere else" — it is "send
the user's text to a server", which is the thing this extension exists to
prevent.

**This is measured, not assumed.** A probe extension compiled a minimal
WebAssembly module from inside a content script's own isolated world, on host
pages serving three different policies
(`packages/extension/scripts/offscreen-probe/`):

| host page CSP | `new WebAssembly.Module(...)` in the content script |
| --- | --- |
| none | compiles |
| `script-src 'self'; object-src 'none'` | **throws** |
| `script-src 'nonce-…' 'strict-dynamic' 'unsafe-inline' https:` | **throws** |

The third is the shape Gemini actually serves (captured 2026-08-29; its
`script-src` carries `'unsafe-eval'` but no `'wasm-unsafe-eval'`). The same
probe records `crossOriginIsolated === false` in the content script's world and
`true` inside the offscreen document, so even where compilation succeeded the
model would be limited to a single WASM thread.

**It grants no access to user data.** `offscreen` lets the extension open one
invisible document *of its own*, at its own origin, from files inside its own
package. It reads nothing, reaches no site, and Chrome shows no install warning
for it — there is no user-facing capability to warn about. What it changes is
where the extension's own code runs, not what that code can see.

**Why not the service worker.** MV3 evicts an idle service worker after about
30 seconds. Model load is 6,568 ms measured, so eviction would charge the user
6.5 seconds on a keystroke, repeatedly. An offscreen document's lifetime is
independent of the service worker's, which is what makes "load once, keep
resident" possible at all — see the residency note below, which is a measured
current behaviour and not a guarantee.

**Why not `chrome.scripting` into a page we control.** It would need a tab, be
visible to the user, and still be subject to that page's policy. The offscreen
document is the mechanism Chrome provides for exactly this.

**No `web_accessible_resources`, and that is a correction.** An earlier draft of
this file said the model and worker would be exposed to the three host origins
so they could be fetched. They are not, and they must not be: an offscreen
document loads packaged resources **through its own extension origin**, which
needs no `web_accessible_resources` entry at all. Verified by fetching three
files that are in no such list from inside the offscreen document — all
returned 200. So the manifest declares no web-accessible resources of any kind,
and the model is not reachable by chatgpt.com, claude.ai, gemini.google.com or
anything else. Listing it would have been both unnecessary and a way to let any
of those pages fingerprint the extension by requesting it.

## Permissions deliberately NOT requested

Each of these would be defensible in some other extension. Each is refused
here, and the refusal is part of the product claim:

| Not requested | Why a privacy tool might want it | Why it is refused |
| --- | --- | --- |
| `<all_urls>` | Work on any chat site | Collapses the three-site trust claim; Quick Redact covers the need |
| `tabs` | Enumerate open tabs for a session view | Reveals browsing history; session counts come from the content script's own tab |
| `scripting` | Inject on demand | Static `content_scripts` declarations are auditable in the manifest; dynamic injection is not |
| `webRequest` / `declarativeNetRequest` | Block outbound requests as a backstop | The guarantee is enforced *before* text enters the page, not by intercepting traffic; and it would imply network inspection the product does not do |
| `clipboardRead` | Read pasted content for the paste guard | The paste guard reads the `paste` event in the page, which needs no permission |
| `identity`, `cookies` | — | No accounts, no server, nothing to authenticate |
| `externally_connectable` | Let a companion site talk to the extension | Absent by design: nothing off-device may address the extension |

## Manifest hardening

- **No remote code.** Everything executes from the package. The model, the
  ONNX runtime, the WASM binaries, the gazetteers and the lexicons are all
  bundled at build time. This is what makes the zero-network claim checkable:
  a reviewer can load the unpacked extension with the network disabled and
  watch it work.
- **`connect-src 'self'`** in the CSP: the extension's own pages cannot open a
  connection to any origin. Combined with no remote code, there is no
  configuration in which a value leaves the device.
- **`'wasm-unsafe-eval'`** is present and is the one apparent loosening. It is
  required to instantiate WebAssembly, which onnxruntime-web needs to run the
  NER model locally. It permits *WebAssembly compilation only* — it does not
  enable `eval` or `new Function` for JavaScript. Without it the model could
  not run on-device, and the alternative to on-device inference is sending
  text to a server, which is the thing this extension exists to prevent.
- **Cross-origin isolation headers** (`COEP: require-corp`, `COOP:
  same-origin`) are declared so WASM multi-threading is available. Measured:
  without them onnxruntime-web silently falls back to single-threaded, which
  makes an already-missed latency budget worse.
- **No `web_accessible_resources` at all.** An earlier draft planned to scope
  it to the three host origins so the model and worker could be fetched. That
  was wrong twice over: an offscreen document loads packaged resources through
  its own extension origin and needs no such entry (verified), and any entry
  would let the listed origins fetch — and therefore fingerprint — the model.
  Nothing in this package is reachable from a web page.
- **No `externally_connectable`**, so no website and no other extension can
  send messages to this one.
