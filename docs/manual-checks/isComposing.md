# Manual check: the `isComposing` Enter

**Status: OPEN.** One step is needed from a person, and it is smaller than it
used to be.

## The question

When a CJK input method is open, pressing Enter **commits the highlighted
candidate**. It is not a "send" keystroke — the user is still typing. Browsers
mark that keydown `isComposing: true`.

PrivacyShield's adapters skip those Enters, deliberately. Gating them would
interrupt the user mid-word on every candidate they accept.

**That is only safe if the site skips them too.** If ChatGPT submits on a
composing Enter, a Japanese, Chinese or Korean user commits a candidate and the
message goes out without ever passing the send gate. Those are precisely the
users the nine-locale work was for.

Our half is settled and tested. The site's half is not.

## What has been established

**A human at a keyboard is no longer needed.** This was previously written up
as needing someone to switch to a CJK IME and type, and that turns out to be
wrong.

`packages/extension/scripts/probe-ime-composition.py` measured it:

| approach | produces a real composing Enter? |
| --- | --- |
| `new KeyboardEvent('keydown', { isComposing: true })` from page script | **No** — arrives with `isTrusted: false`; a site checking trust ignores it |
| CDP `Input.imeSetComposition` + `Input.dispatchKeyEvent` | **Yes** — `compositionstart` fires with `isTrusted: true`, and the following Enter arrives `isComposing: true, isTrusted: true` |

So the composition itself is fully automatable.

**What still cannot be automated is the login.** ChatGPT's real composer — a
ProseMirror `contenteditable` at `#prompt-textarea` — exists only behind a
signed-in session. No script in this repository will type a password, and none
will try to get past a bot challenge.

## What happened on the last attempt

Run on 2026-09-02 against `.live-profile`, the profile created by hand at M9:

```
session: {'hasPromptComposer': False, 'contentEditables': 0,
          'hasSendButton': False,
          'loginAffordances': ['Log in', 'Sign up for free', ...]}
NOT SIGNED IN - this is the logged-out landing page.
```

The M9 session has expired.

**The first version of the probe reported this as a pass**, and was wrong.
Logged out, chatgpt.com still renders a `<textarea>` on its landing page. The
script found it, composed into it, pressed Enter, saw nothing sent, and printed
`WAITS CORRECTLY` — about a textarea with no send handler attached to it at
all.

Its own control step is what caught this: a plain Enter did not send either, it
inserted a newline. A negative result means nothing unless a positive one is
shown to be observable in the same run. The probe now checks for the signed-in
composer up front and refuses to proceed without it.

## The step

Two commands. The first opens a browser and waits while **you** log in; no
script sees the password.

```bash
python packages/extension/scripts/login-profile.py
#   log in by hand in the window that opens, then close it

python packages/extension/scripts/probe-ime-live.py --control
```

Exit codes: `0` waits correctly, `1` **sends prematurely**, `3` inconclusive
(not signed in, or the composition never reached the handler).

`--control` presses a plain Enter afterwards and requires it to send. Without
that, "nothing was sent" is indistinguishable from "nothing could have been
sent", which is the exact mistake described above.

**It may send a message to your account, and that is the point.** The text is
`こんにちは`. If the composing Enter submits it, that greeting appears in your
history — which is the finding. The control step sends one deliberately.

## Doing it by hand instead

If you would rather not run the script, `ime-diagnostic.js` in this directory
can be pasted into DevTools on a signed-in tab. It only observes: it never
sends, never edits the composer, and never reads its contents beyond their
length.

1. Open a signed-in chatgpt.com tab and click into the message box.
2. Paste the contents of `ime-diagnostic.js` into the console.
3. Switch to a CJK IME. Type until the candidate window is open.
4. Press Enter **once**, to commit the candidate.
5. Run `__psImeReport()`.

It reports `WAITS CORRECTLY`, `SENDS PREMATURELY`, or `INCONCLUSIVE — no Enter
was seen while composing`, and prints every Enter it saw with its
`isComposing`, `keyCode` and `isTrusted`. `keyCode` is recorded too because
some sites test for `229` instead of `isComposing`, and knowing which signal
was available matters if the answer turns out to be bad.

`__psImeStop()` removes it.

The snippet is exercised by `probe-ime-composition.py`, which installs it and
drives a CDP-generated composing Enter through it, so it is known to report
correctly before anyone pastes it anywhere.

## If the answer is "sends prematurely"

The adapter can no longer skip composing Enters unilaterally. The likely fix is
to gate them and release the keystroke back to the page after analysis, the way
the existing replay path does — at the cost of a visible pause on every
candidate commit. That is a real UX cost, which is why the measurement has to
come first.

## Claude and Gemini

Not yet asked. The same probe points at one origin; the other two need the same
treatment, and there is no reason to assume all three behave alike.
