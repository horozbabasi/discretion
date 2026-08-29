# Offscreen-document probe

A throwaway extension that answers, in a real browser, the questions the
decision to run NER in an offscreen document rests on. The Chrome
documentation is corroboration; this is the authority, and the results are
committed beside the scripts so a reader can check the claim rather than the
conclusion.

```
python packages/extension/scripts/offscreen-probe/run_probe.py    # lifetime, isolation, IPC cost
python packages/extension/scripts/offscreen-probe/run_probe2.py   # content-script WASM under CSP, + control
```

Both need Playwright and a Chromium-family browser (`channel='msedge'` as
written). `run_probe.py` takes `IDLE_CHECKS` as a comma-separated list of
seconds — the committed result used `45,120,300,600`.

## What each answers, and what it found

Measured on Edge 151.0.4129.107, 8 logical cores, 2026-08-29.

| # | Question | Result |
| --- | --- | --- |
| A | Does an offscreen document survive idle with its state intact? | **Yes, at 45 / 120 / 300 / 600 s.** Same module-evaluation nonce throughout, and 64 MB of touched memory still checksummed correctly. |
| B | Is the service worker evicted while it lives? | **Not observable here** — see the control below. |
| C | Is `crossOriginIsolated` true inside the offscreen document? | **Yes**, and a Web Worker created there inherits it (`SharedArrayBuffer` constructible in both). This is what gives WASM its threads. |
| D | Can the offscreen document compile WebAssembly? | **Yes.** |
| E | Can a content script reach the offscreen document directly? | **Yes**, with no service-worker hop on the message path. |
| F | IPC round-trip cost, no work at the far end | **p50 1.2–2.0 ms**, near-flat from 0 to 20,000 characters of payload. |
| G | Can a content script compile WASM under a host-page CSP? | **No.** Compiles with no policy; throws under `script-src 'self'` and under a realistic `strict-dynamic`+nonce policy. |
| H | Control for B | With **no** offscreen document, 150 s idle, the service worker still did not restart. |

## The control, and why it is here

Probe A observed `swBootCount == 1` across ten minutes of idle, which reads as
"the service worker was never evicted". Two explanations fit: the offscreen
document keeps it alive, or the debugger this test is driven through keeps it
alive. Naming a condition that has not been varied is worse than naming none,
so H runs the identical idle wait with no offscreen document — and the service
worker still does not restart.

So the observation is an artefact of the instrumentation, and the probe cannot
say anything about service-worker eviction. It is reported as unmeasured. (The
Chromium source says an offscreen document does *not* extend the service
worker's keepalive: `ProcessManager::CanKeepalive()` returns false for
`ViewType::kOffscreenDocument`. That is corroboration for the expected
behaviour, not a measurement of it.)

## Residency is a current behaviour, not a contract

The ten-minute result says what Chrome does today. It is not a guarantee:

- Chrome documents that only the `AUDIO_PLAYBACK` reason sets a lifetime limit
  and that "all other reasons don't set lifetime limits", and in the source
  every other reason maps to an `EmptyLifetimeEnforcer` whose `IsActive()`
  returns `true` unconditionally.
- But `TerminateDocument()` exists and is unused, and Chrome DevRel has said on
  the record that they expect to "add more checks to ensure offscreen documents
  are closed when they are no longer being used".

So the extension must treat the document as something that can disappear —
re-provisioning it, and blocking sends while it is unavailable — rather than
treating residency as a correctness property. If Chrome does start closing idle
offscreen documents, the 6,568 ms model load returns to the user's critical
path and the placement decision needs revisiting.
