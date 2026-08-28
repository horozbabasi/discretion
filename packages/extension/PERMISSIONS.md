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

## `permissions: ["storage"]` — the only API permission

**Justification.** Stores the user's own settings: sensitivity profile,
per-entity toggles, surrogate-versus-token mode, allowlist and denylist, and
the values-free Local Insights counters (M10).

**What is never stored.** No detected values, no message text, no
conversation content. SPEC's third non-negotiable forbids plaintext
persistence, and Local Insights satisfies it by construction — it records
*counts by category*, never the values counted. The unmask vault lives in
memory only, scoped per tab session, and is cleared on navigation.

**Why not `unlimitedStorage`.** Settings and counters are kilobytes. Asking
for more would be unjustifiable.

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
- **`web_accessible_resources`** is scoped to the three host origins rather
  than `<all_urls>`, so the model and worker are not fetchable by arbitrary
  pages fingerprinting installed extensions.
- **No `externally_connectable`**, so no website and no other extension can
  send messages to this one.
