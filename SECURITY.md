# Security

Discretion exists to keep sensitive text out of somewhere it should not go.
A vulnerability here is not an inconvenience — it is the failure of the one
thing the tool does. This file says how to report one, what the extension
claims, and how to check those claims yourself rather than take them on trust.

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting** on
`https://github.com/horozbabasi/discretion` → *Security* → *Report a
vulnerability*. It is private until we agree it is not, and it does not require
an email address either of us has to protect.

Please do not open a public issue for anything that could let text reach a
site unmasked.

What helps most, in order:

1. The **exact input**, with any real value replaced by a fake of the same
   shape. `GB33BUKB20201555555555` is a valid IBAN checksum with no owner;
   `rene.dupont@lemonde-conseil.fr` is a well-formed address at a domain that
   does not exist. Never send us a real credential to prove a point — if a real
   one is genuinely the only reproducer, say so and we will work out something
   else.
2. Which site, and roughly when. Adapters depend on markup that changes.
3. What you expected and what happened. "It sent the message" and "it refused
   to send the message" are both worth reporting, and only one of them is a
   leak.

**In scope:** anything that causes text to leave the composer unmasked, any
persistence of a value to disk, any outbound network request from the
extension, and anything that lets a page read the extension's state.

**Out of scope:** a detector missing something it was never trained or written
to catch (that is a recall bug — please still report it, as an issue, with
the input), and anything requiring the attacker to already control the user's
browser profile.

We do not currently run a bounty. We will credit you in the release notes
unless you would rather we did not.

## What the extension claims

These are the guarantees. Each one is testable, and each has a check in the
repository that would fail if it broke.

### 1. No runtime network access

The extension makes no outbound request of any kind after it is installed. The
model, its tokenizer, the WASM runtime and every gazetteer are bundled at build
time.

*How to check it yourself:* `packages/extension/scripts/verify-live-site.py`
asks the extension's own service worker to fetch three external origins and
records what happens; all three are refused by the `connect-src 'self'` policy,
and a same-origin control proves the probe can tell a blocked request from an
allowed one. Run it and read the request log — the point of that script is that
the claim is confirmed by observation rather than by re-reading the manifest.

You can also confirm it by hand: open DevTools on any of the three sites, filter
the Network panel to the extension's origin, and use it for a while.

### 2. Fail closed

Any detection error, timeout, adapter failure, or ambiguity about which element
is being submitted **blocks the send**. The user loses a keystroke; they do not
lose the value. There is no configuration that turns this into fail-open,
because "found nothing" and "could not look" are indistinguishable to the
person reading the screen and only one of them is safe.

Quick Redact follows the same rule: if the second detection stage did not run,
it produces no output at all rather than a partly-masked string someone would
paste into Slack believing it was clean.

### 3. No plaintext persistence

Detected values live in memory, in one object, for one tab session, and are
dropped on navigation or close. Nothing writes them to `storage.local`,
`localStorage`, `IndexedDB`, the clipboard, or a log.

Three things *are* written to `chrome.storage.local`, and all three are
deliberate:

| what | why it is allowed |
| --- | --- |
| **Settings** | The options page exists to persist them. |
| **Local Insights** | Counts by category by month. No values, no text, no type, no site, no timestamp finer than a month. |
| **A debug preference** | A boolean. |

One honest caveat: the **allowlist and denylist are user-typed strings**, and
someone may well type their own email address into "never mask these". That is
persisted plaintext, on their own device, that they chose to persist — a
different thing from the extension quietly retaining what it detected, but not
nothing. The options page says so where they type it, and the settings export
file carries the same warning.

### 4. Nothing the page can read

Injected UI lives in a **closed** shadow root. The panel lists entity *types*,
never values — and the type is itself something the host page should not have,
since the page is the party the tool exists to withhold information from.

Diagnostics carry tags, attribute *names* and invariant ids. Never text, never
attribute values.

### 5. No `innerHTML`

Every node in every surface is constructed programmatically —
`document.createElement` and `textContent`. There is no code path in this
repository that parses a string as markup. `packages/extension/src/popup/dom.ts`
and `packages/web/src/dom.ts` are the helpers, and neither has a parameter that
takes markup, so the mistake cannot be expressed.

*How to check it yourself:*

```
grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML\|document.write" packages/*/src
```

The only hits are comments explaining why it is not used.

## Permissions

`packages/extension/PERMISSIONS.md` is the full account. In short:

- `host_permissions` is **exactly three origins** — `chatgpt.com`, `claude.ai`,
  `gemini.google.com` — and nothing else, ever. That is why Quick Redact
  exists: it covers every other destination without widening this list.
- `permissions` is `offscreen` (the model needs a document that can compile
  WebAssembly outside the host page's CSP) and `storage`.
- **No `tabs` permission.** The popup could have read the active tab's URL to
  show per-site status; instead it sends one message to the tab and lets
  whoever is running there answer with its own site id. A site with no content
  script does not answer, and that silence is the "does not run here" state.
- No `web_accessible_resources`: nothing the extension ships can be fetched or
  probed by a page.

Content Security Policy for extension pages:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none';
form-action 'none'; connect-src 'self'
```

`connect-src 'self'` is what makes guarantee 1 enforced by the browser rather
than by our good intentions.

## Supply chain

**Runtime dependencies are three, and they are listed here in full:**

| package | version | licence | why |
| --- | --- | --- | --- |
| `@huggingface/transformers` | 4.2.0 | Apache-2.0 | runs the NER model |
| `onnxruntime-web` | 1.26.0-dev.20260416-b7804b056c | MIT | WASM inference, pulled in by the above |
| `libphonenumber-js` | 1.13.11 | MIT | phone parsing — SPEC forbids hand-rolled phone regex |

Everything else in `package.json` is a build or test tool and ships nothing.

**`onnxruntime-web` currently resolves to a `-dev` prerelease.** That is a
transitive resolution, not a choice, and it is recorded here rather than left
for someone to discover: a nightly build of the WASM runtime is a weaker
supply-chain position than a tagged release, and pinning it to one is open work.

**The lockfile is committed.** `package-lock.json` fixes every transitive
package to an exact version and integrity hash. Build with **`npm ci`**, not
`npm install` — `ci` installs the lockfile exactly and fails if
`package.json` disagrees with it, while `install` may resolve a newer version
inside an existing `^` range and rewrite the lock.

**The model is not in the repository.** It is ~280 MB and is fetched once by
`npm run ext:fetch-model`, which records what it downloaded. The build prints a
warning and the extension fails closed at runtime if the model is absent, so a
build without it cannot silently ship a non-detecting extension.

## Reproducing the build

```
npm ci
npm run ext:fetch-model      # once; ~280 MB
npm run build
```

`packages/extension/build/` is the loadable extension. The build is
**unminified on purpose** — a reviewer has to be able to read what ships — and
`scripts/build.mjs` fails rather than warns if:

- any required file is missing or zero-length;
- the content script contains a very large base64 literal (the gazetteers
  belong in the offscreen document, not in a script parsed on every page load
  of all three sites);
- the content script contains any of the eight translated catalogues
  (translations reach the page through `chrome.i18n`; the content script
  carries English only).

Each of those checks was verified by deliberately breaking it and confirming
the build exits non-zero.

## What this does not protect against

Stated plainly, because a security tool that overstates itself is worse than
one that does not exist:

- **Attachments.** Files, images and screenshots are not inspected.
- **Anything sent from another application**, unless it is put through Quick
  Redact first.
- **What you type before you send it.** The site's own JavaScript can read the
  composer as you type. Only what you *send* is masked.
- **Recall.** Detection misses things. Published per-type precision and recall
  are in `BENCHMARKS.md`; `GENERIC_SECRET` recall in particular is 55.4%, and
  that number is printed rather than rounded away.
- **A compromised browser profile.** An attacker who can already read
  `chrome.storage.local` or run code in the extension's own context is past
  every boundary described here.

## Translations

The eight non-English catalogues are **machine-generated and have not been
reviewed by native speakers**. Structure is enforced by tests — placeholder
budgets, plural categories, no copy-pasted English — but structure is not
meaning. A mistranslation in a security warning is a security problem, and this
is a release blocker rather than a nicety.
