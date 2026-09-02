# Manual check: the `isComposing` Enter

**Status: OPEN on all three sites.** Two routes remain, both needing a person
for the login and nothing else.

## The question

When a CJK input method is open, pressing Enter **commits the highlighted
candidate**. The user is still typing; it is not a "send" keystroke. Browsers
mark that keydown `isComposing: true`.

PrivacyShield's adapters skip those Enters deliberately — gating them would
interrupt the user mid-word on every candidate they accept.

**That is only safe if the site skips them too.** If a site submits on a
composing Enter, a Japanese, Chinese or Korean user commits a candidate and the
message goes out without passing the send gate. Those are exactly the users the
nine-locale work was for.

Our half is settled and tested. The sites' half is not, for **any** of the
three.

## What is already established

**A CJK input method is not required.** This was previously written up as
needing someone to type with an IME, and that is wrong.
`probe-ime-composition.py` measured it:

| approach | produces a real composing Enter? |
| --- | --- |
| `new KeyboardEvent('keydown', { isComposing: true })` from page script | **No** — `isTrusted: false`; a site checking trust ignores it |
| CDP `Input.imeSetComposition` + `Input.dispatchKeyEvent` | **Yes** — trusted `compositionstart`, then Enter with `isComposing: true, isTrusted: true` |

**What blocks it is the login.** Playwright *launching* the browser sets
`--enable-automation` and `navigator.webdriver`, and the sites' login
challenges refuse it. That wall is not to be worked around: no stealth flags,
no fingerprint spoofing, no challenge solving.

---

## Route A — attach to a browser you launched (recommended)

The difference that matters: **you** start an ordinary browser and log in as a
human. Nothing is automated at launch, so there is nothing to detect. Only
afterwards does the probe attach, the way DevTools does.

Measured on this machine, attached to a hand-launched Edge 151:

```
navigator.webdriver : False        (it is True when Playwright launches)
headless in UA      : False
plugins             : 5
languages           : ['en-US', 'en', 'tr']
Input.imeSetComposition through the attach: accepted
```

**Nothing is spoofed.** The browser genuinely is an ordinary one, the person
genuinely is a person, and if a challenge appears a human answers it. That is
the whole difference from the stealth-flag approach this project refuses.

### Steps

**1. Start Edge yourself**, in PowerShell:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
    --remote-debugging-port=9222 `
    --user-data-dir="C:\ps-probe-profile"
```

`--user-data-dir` is required: since Chrome/Edge 136, remote debugging is
refused on the default profile. It also means **your everyday profile is never
touched** — this is a scratch profile that starts logged out, and the probe
never sees your normal browsing session.

**2. Log in by hand** in that window, at whichever of these you want covered:

- `https://chatgpt.com/`
- `https://claude.ai/new`
- `https://gemini.google.com/app`

Open a **new chat** on each so the real composer is on screen. It is an
ordinary browser, so the login behaves normally.

**3. Leave it open** and run:

```bash
python packages/extension/scripts/probe-ime-live.py --attach 9222 --control
# or one at a time:
python packages/extension/scripts/probe-ime-live.py --attach 9222 --control --site chatgpt
```

The probe prints `navigator.webdriver` on attach, so you can see for yourself
that it is looking at a non-automated browser.

Exit codes: `0` all sites wait correctly, `1` **at least one sends
prematurely**, `3` inconclusive (not signed in, or the composition never
reached the handler).

**4. Close the browser and delete `C:\ps-probe-profile`** when done.

### `--control` sends one message per site, on purpose

The text is `こんにちは`. If the composing Enter submits it, that greeting
appears in your history — which *is* the finding.

The control step then sends one deliberately, because **"nothing was sent"
proves nothing unless a plain Enter is shown to send in the same run.** That is
not hypothetical: without it, the probe once reported `WAITS CORRECTLY` while testing the logged-out landing page, whose `<textarea>` has no send handler
attached at all.

Run without `--control` if you prefer, and the result is labelled
`NO CONTROL - weaker`.

---

## Route B — fully manual, no automation anywhere

If Route A is unwanted, this touches no automation at all. It needs a CJK input
method, because without CDP the composition has to come from a real IME.

### Installing a Japanese IME on Windows (about two minutes)

1. **Settings → Time & language → Language & region**
2. **Add a language** → search `日本語` (Japanese) → **Next** → **Install**
3. Switch input with **Win + Space** (a language bar appears near the clock)

Remove it the same way afterwards.

### The check

1. Open a signed-in tab in **your own normal browser** and click into the
   message box.
2. Open DevTools (**F12**) → **Console**.
3. Paste the entire contents of
   [`ime-diagnostic.js`](ime-diagnostic.js). It prints `IME diagnostic armed`.
4. Switch to the Japanese IME (**Win + Space**) and type `nihon` — a candidate
   window appears under the text. **Do not press Enter yet.**
5. Press **Enter once**, to commit the candidate.
6. Run `__psImeReport()`.
7. `__psImeStop()` to remove it.

### Reading the result

- **`WAITS CORRECTLY`** — the composing Enter committed the candidate and did
  not submit. This is the good case.
- **`SENDS PREMATURELY`** — real defect; see below.
- **`INCONCLUSIVE — no Enter was seen while composing`** — the candidate window
  was not open when you pressed Enter. Retry from step 4.

The snippet only observes: it never sends, never edits the composer, and never
reads its contents beyond their length. It also records `keyCode`, because some
sites test for `229` instead of `isComposing`, and knowing which signal was
available matters if the answer turns out to be bad.

It is exercised by `probe-ime-composition.py`, which installs it and drives a
CDP-generated composing Enter through it — so it is known to report correctly
before anyone pastes it into a signed-in session.

Repeat on all three sites. **There is no reason to assume they behave alike;**
they agree on nothing else about their composers.

---

## If any site answers "sends prematurely"

That adapter can no longer skip composing Enters unilaterally. The fix follows
the existing replay path: gate the keystroke, run analysis, then release the
user's own action back to the page — the same one-shot replay the send gate
already uses for clicks and plain Enters.

The cost is a visible pause on every candidate commit, for that site only,
which is why the measurement has to come first: it is a real UX regression to
impose on the exact users this is meant to protect, and it should not be
imposed on sites that do not need it.

`probe-ime-live.py` exits `1` in that case, so it can gate a release.
