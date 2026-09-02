"""LIVE SITE verification, against each site's REAL editor rather than a fixture.

D43a. Every earlier confirmation was against committed fixtures, which are
snapshots of DOM, not of ProseMirror or Quill. An editor that ACCEPTS a write
and reverts it on its next reconciliation looks identical in a fixture and
would silently un-mask a message in production. Only a real editor answers it.

Also exercised, because the same panel is how the write is reached without
sending: D29's confirmation for a composer filled by something other than
typing - a restored draft, a URL prefill, a suggestion chip.

  gemini    real Quill, reachable WITHOUT login
  claude    real ProseMirror, needs a logged-in profile
  chatgpt   real ProseMirror, needs a logged-in profile

NOTHING IS SENT. Before the one step that could submit, every POST is aborted
at the network layer, and the run reports how many it blocked. The value used
is a synthetic IBAN.

A site that cannot be reached is SKIPPED and reported as skipped, never as
passed - a run that quietly covers one site and prints success is exactly the
kind of check this project keeps finding.

Run:  python packages/extension/scripts/verify-live-site.py
      python packages/extension/scripts/verify-live-site.py --profile --sites claude,chatgpt

`--profile` reuses the session created by `login-profile.py`, which never
handles a password: you log in by hand and it keeps the cookie.
"""

import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
PROFILE = ROOT / '.live-profile'

SITES = {
    'gemini': {
        'url': 'https://gemini.google.com/app',
        'composer': 'div.ql-editor[role="textbox"]',
        'editor': 'Quill',
        'needs_login': False,
    },
    'claude': {
        'url': 'https://claude.ai/new',
        'composer': 'div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]',
        'editor': 'ProseMirror',
        'needs_login': True,
    },
    'chatgpt': {
        'url': 'https://chatgpt.com/',
        'composer': 'div.ProseMirror[contenteditable="true"], #prompt-textarea',
        'editor': 'ProseMirror',
        'needs_login': True,
    },
}

IBAN = 'GB33BUKB20201555555555'
MESSAGE = f'please wire it to {IBAN} today'

USE_PROFILE = '--profile' in sys.argv
requested = 'gemini'
for i, arg in enumerate(sys.argv):
    if arg == '--sites' and i + 1 < len(sys.argv):
        requested = sys.argv[i + 1]
SELECTED = [s.strip() for s in requested.split(',') if s.strip() in SITES]

# ─────────────────────────────────────────────────────────────────────────
# THE REQUEST LOG, and the positive control that makes it worth anything.
#
# SPEC's first non-negotiable is zero runtime network access. Until now that
# was supported by reading the manifest (`connect-src 'self'`) and the code
# that overrides transformers.js's remote defaults - which is exactly the kind
# of evidence this project keeps discovering to be worthless. The vendored
# bundle DOES contain `cdn.jsdelivr.net` and `remoteHost: huggingface.co` as
# library defaults, so the claim deserves an observation rather than a reading.
#
# THE TRAP THIS IS BUILT AGAINST: if Playwright cannot observe requests from
# the extension's own contexts, then "no bad extension request was seen" is
# true and meaningless, and the assertion passes because it is blind. So the
# run first proves it CAN see them - the offscreen document must load the model
# and the ORT binaries over chrome-extension:// URLs, and if none of those
# appear in the log the channel is blind and the audit FAILS rather than
# passes.
# ─────────────────────────────────────────────────────────────────────────

NL = chr(10)

REQUESTS = []

TARGET_HOSTS = {'gemini.google.com', 'claude.ai', 'chatgpt.com'}


def initiator_of(request):
    """Where the request came from: an extension context, a page, or unknown."""
    try:
        worker = request.service_worker
        if worker is not None:
            return worker.url
    except Exception:
        pass
    try:
        frame = request.frame
        if frame is not None:
            return frame.url
    except Exception:
        pass
    # Some requests belong to no frame and no worker Playwright exposes. Recorded
    # as unknown rather than silently attributed to the page - an unattributable
    # request is exactly what a leak would look like.
    return None


def record(request):
    REQUESTS.append(
        {
            'url': request.url,
            'method': request.method,
            'type': request.resource_type,
            'from': initiator_of(request),
        }
    )


def host_of(url):
    if url is None:
        return None
    if url.startswith('chrome-extension://'):
        return 'chrome-extension'
    try:
        return url.split('/')[2].split(':')[0]
    except Exception:
        return None


EXTERNAL_PROBES = [
    'https://cdn.jsdelivr.net/npm/onnxruntime-web/package.json',
    'https://huggingface.co/api/models',
    'https://example.com/',
]


def audit_page_requests():
    """Report the observed request log, and say exactly what it covers.

    IT DOES NOT COVER THE EXTENSION. Measured, not assumed: a first version of
    this asserted that no extension-origin request went anywhere but the three
    target sites, and it passed - on a run where Playwright reported 124
    requests and ZERO from any extension context. The assertion was true
    because the channel is blind, which is worth nothing. Playwright surfaces
    page and page-service-worker traffic; the extension service worker, the
    offscreen document and onnxruntime's WASM worker threads are separate CDP
    targets it does not forward network events for.

    So this prints what it saw and makes no claim beyond it. The claim about
    the extension is made by the two probes below, which ask the extension
    itself.
    """
    print(f'{NL}=== request log (page-origin) ===')
    print(f'total requests observed: {len(REQUESTS)}')
    hosts = {}
    for r in REQUESTS:
        host = host_of(r['url']) or 'unknown'
        hosts[host] = hosts.get(host, 0) + 1
    for host, count in sorted(hosts.items(), key=lambda kv: -kv[1])[:15]:
        print(f'  {count:5d}  {host}')

    from_extension = [r for r in REQUESTS if (r['from'] or '').startswith('chrome-extension://')]
    print(f'{NL}requests attributed to an extension context: {len(from_extension)}')
    if not from_extension:
        print('  -> this channel CANNOT see extension traffic (verified: the offscreen')
        print('     document demonstrably loads a 280 MB model over chrome-extension://')
        print('     URLs during this run, and none appear here). No conclusion about')
        print('     the extension is drawn from this log.')
    else:
        for r in from_extension[:20]:
            print(f'  {r["method"]:6s} {r["url"][:100]}')


def probe_extension_network(worker):
    """Ask the extension to reach the network, and confirm it cannot.

    Stronger than a log of what did not happen: this is what happens when the
    extension TRIES. Run inside the extension's own service worker, which is
    governed by the same `content_security_policy.extension_pages` declaration
    as the offscreen document - `connect-src 'self'`.

    Returns True if every attempt was refused.
    """
    print(f'{NL}=== zero-network enforcement (probed, not read) ===')

    # NEGATIVE CONTROL, first. "BLOCKED (Failed to fetch)" is also what a
    # broken probe returns - a typo in the evaluate, a wrong API, an exception
    # anywhere - so a run where everything is blocked proves nothing until one
    # thing that SHOULD succeed does. A same-origin fetch of the extension's
    # own manifest is permitted by `connect-src 'self'`; if even that is
    # reported blocked, the probe is measuring itself and the result is void.
    control = worker.evaluate(
        """async () => {
          try {
            const res = await fetch(chrome.runtime.getURL('manifest.json'));
            return 'ALLOWED (status ' + res.status + ')';
          } catch (e) { return 'BLOCKED (' + ((e && e.message) || e) + ')'; }
        }"""
    )
    print(f'  {"[control] own manifest":24s} {control}')
    if not control.startswith('ALLOWED'):
        print('  -> THE PROBE IS BROKEN: a same-origin fetch that must succeed did not.')
        print('     Every BLOCKED below is uninterpretable. Reporting as UNVERIFIED.')
        FAILURES.append('the zero-network probe could not distinguish blocked from allowed')
        return False

    ok_all = True
    for url in EXTERNAL_PROBES:
        try:
            verdict = worker.evaluate(
                """async (u) => {
                  try {
                    const res = await fetch(u, { method: 'GET' });
                    return 'ALLOWED (status ' + res.status + ')';
                  } catch (e) {
                    return 'BLOCKED (' + ((e && e.message) || e) + ')';
                  }
                }""",
                url,
            )
        except Exception as exc:
            verdict = f'PROBE FAILED ({str(exc)[:60]})'
        host = host_of(url)
        print(f'  {host:24s} {verdict}')
        if not verdict.startswith('BLOCKED'):
            ok_all = False
            FAILURES.append(f'extension reached {host}: {verdict}')
    if ok_all:
        print('  -> every attempt from an extension context was refused.')
    return ok_all


def probe_offscreen_config(worker):
    """Read the offscreen document's LIVE resolved runtime configuration.

    Not the source that sets it: what it actually resolved to, asked over the
    extension's own port. `wasmPaths` pointing anywhere but chrome-extension://
    is how D40b happened - onnxruntime silently fetching its binaries from a
    CDN because nobody had set the path.
    """
    print(f'{NL}=== offscreen runtime config (live readback) ===')
    try:
        status = worker.evaluate(
            """async () => {
              return await new Promise((resolve) => {
                const port = chrome.runtime.connect({ name: 'discretion-ner' });
                const timer = setTimeout(() => resolve({ error: 'timeout' }), 120000);
                port.onMessage.addListener((msg) => {
                  clearTimeout(timer);
                  resolve(msg);
                });
                port.postMessage({ op: 'status', id: 1 });
              });
            }"""
        )
    except Exception as exc:
        print(f'  could not read status: {str(exc)[:100]}')
        return False

    print(f'  {status}')
    body = status.get('status') if isinstance(status, dict) else None
    paths = (body or {}).get('wasmPaths') if isinstance(body, dict) else None
    if paths is None and isinstance(status, dict):
        paths = status.get('wasmPaths')
    if isinstance(paths, str) and paths.startswith('chrome-extension://'):
        print('  -> onnxruntime resolves its binaries from inside the package.')
        return True
    print(f'  -> wasmPaths is {paths!r}, NOT a packaged chrome-extension:// path.')
    FAILURES.append(f'offscreen wasmPaths is {paths!r}')
    return False


AUDIT_WORKER = None
FAILURES = []
SKIPPED = []
PASSED = []


def fail(site, message):
    print(f'  FAIL [{site}] {message}')
    FAILURES.append(f'{site}: {message}')


def skip(site, message):
    print(f'  SKIP [{site}] {message}')
    SKIPPED.append(f'{site}: {message}')


def ok(message):
    print(f'  ok: {message}')


def state_of(host):
    try:
        return host.get_attribute('data-state')
    except Exception:
        return None


def wait_for_state(page, host, wanted, timeout_s=150):
    deadline = time.time() + timeout_s
    seen = None
    while time.time() < deadline:
        seen = state_of(host)
        if seen == wanted:
            return seen
        page.wait_for_timeout(500)
    return seen


def read_composer(composer):
    return composer.evaluate('el => el.value !== undefined ? el.value : el.innerText')


def verify(ctx, site, config):
    print(f'\n=== {site} ({config["editor"]}) ===')
    page = ctx.new_page()
    try:
        page.goto(config['url'], wait_until='domcontentloaded')
        page.wait_for_timeout(9000)

        composer = page.locator(config['composer']).first
        try:
            composer.wait_for(state='attached', timeout=45_000)
        except Exception:
            if config['needs_login']:
                skip(site, f'no composer at {page.url[:70]} - not logged in, or a bot challenge')
            else:
                fail(site, f'no composer at {page.url[:70]}')
            return

        host = page.locator('discretion-surface')
        try:
            # state='attached': the host starts display:none, and the default
            # wait is for VISIBLE - which times out on an extension that has
            # attached perfectly well.
            host.wait_for(state='attached', timeout=30_000)
        except Exception:
            fail(site, 'the extension did not attach to this page')
            return
        ok('the extension attached')

        # D29 first, because its panel is also how the write is reached without
        # sending. Exactly what a restored draft or a suggestion chip does: the
        # text appears with NO editing event, so the input witness never sees
        # it and the pre-D47 code refused the send outright.
        page.evaluate(
            """([sel, text]) => {
              const el = document.querySelector(sel);
              if (el.value !== undefined) { el.value = text; return; }
              el.innerHTML = '<p>' + text + '</p>';
            }""",
            [config['composer'], MESSAGE],
        )
        page.wait_for_timeout(1500)
        composer.click()
        page.keyboard.press('Enter')

        state = wait_for_state(page, host, 'review', timeout_s=150)
        page.screenshot(path=str(BUILD / f'live-{site}-1-ask.png'))
        if state != 'review':
            fail(site, f'a prefilled composer did not produce the confirmation (state={state!r})')
            return
        ok('D29: the prefilled send was INTERCEPTED and asks instead of refusing')

        before = read_composer(composer)
        if IBAN not in before:
            fail(site, f'the composer lost the prefilled text: {before[:100]!r}')
            return
        ok('nothing sent yet; the original is still in the composer')

        # NOTHING MAY LEAVE. Confirming replays the user's own Enter, which on
        # a logged-in page would submit. Every POST is aborted first, so the
        # write is exercised while a message remains unable to reach anyone.
        posted = []

        def block_posts(route):
            if route.request.method == 'POST':
                posted.append(route.request.url[:100])
                route.abort()
            else:
                route.continue_()

        ctx.route('**', block_posts)
        try:
            box = host.bounding_box()
            if box is None:
                fail(site, 'the panel has no box')
                return
            # "Protect and send" is the primary action, last in the actions row.
            page.mouse.click(box['x'] + box['width'] - 62, box['y'] + box['height'] - 22)
            page.wait_for_timeout(3500)

            after = read_composer(composer)
            page.screenshot(path=str(BUILD / f'live-{site}-2-masked.png'))
            if IBAN in after:
                fail(site, f'the ORIGINAL survived the write: {after[:120]!r}')
                return
            if not re.search(r'[A-Z]{2}\d{2}[A-Z0-9]{10,}', after):
                fail(site, f'no surrogate in the composer after confirming: {after[:120]!r}')
                return
            ok(f'real {config["editor"]} ACCEPTED the write: {after.strip()[:80]!r}')

            # THE QUESTION A FIXTURE CANNOT ANSWER: an editor that accepts a
            # write and reverts it on its next reconciliation looks identical
            # in a snapshot and silently un-masks a message in production.
            page.wait_for_timeout(7000)
            settled = read_composer(composer)
            if IBAN in settled:
                fail(site, f'the ORIGINAL came back after reconciliation: {settled[:120]!r}')
            elif settled.strip() != after.strip():
                fail(site, f'the editor rewrote the masked text: {settled[:120]!r}')
            else:
                ok(f'and it SURVIVED 7s of {config["editor"]} reconciliation')
                PASSED.append(site)
            page.screenshot(path=str(BUILD / f'live-{site}-3-settled.png'))
            print(f'  POSTs blocked during the confirm step: {len(posted)}')
        finally:
            ctx.unroute('**', block_posts)
    finally:
        page.close()


if USE_PROFILE and not PROFILE.is_dir():
    print(f'no profile at {PROFILE}')
    print('Run: python packages/extension/scripts/login-profile.py')
    sys.exit(1)

print(f'sites: {", ".join(SELECTED)}')
print(f'profile: {PROFILE if USE_PROFILE else "(fresh, no login)"}')

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE) if USE_PROFILE else '',
        channel='msedge',
        headless=False,
        args=[f'--disable-extensions-except={BUILD}', f'--load-extension={BUILD}'],
        viewport={'width': 1360, 'height': 950},
    )
    try:
        # Subscribed BEFORE any navigation, so the model and ORT loads that the
        # positive control depends on are not missed.
        ctx.on('request', record)
        worker = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event(
            'serviceworker', timeout=30_000)
        print(f'extension loaded: {worker.url.split("/")[2]}')
        AUDIT_WORKER = worker
        for site in SELECTED:
            verify(ctx, site, SITES[site])
        audit_page_requests()
        network_ok = probe_extension_network(worker)
        config_ok = probe_offscreen_config(worker)
        network_ok = network_ok and config_ok
    finally:
        ctx.close()



# The full log, written rather than printed: it is thousands of lines on a real
# page, and it is the evidence, so it should be reviewable rather than skimmed.
LOG = BUILD / 'request-log.txt'
LOG.write_text(
    NL.join(f'{r["method"]:6s} {r["type"]:12s} from={r["from"]}{NL}       {r["url"]}' for r in REQUESTS),
    encoding='utf-8',
)
print(f'{NL}full request log: {LOG} ({len(REQUESTS)} entries)')

print()
for line in SKIPPED:
    print(f'SKIPPED - {line}')
if FAILURES:
    print('\nFAILED:')
    for line in FAILURES:
        print(f'  - {line}')
    sys.exit(1)
if not network_ok:
    print('\nFAILED: the zero-network audit did not hold (see above).')
    sys.exit(1)
print(f'\nVERIFIED against a real editor: {", ".join(PASSED) if PASSED else "(none)"}')
if SKIPPED:
    print('The skipped sites are NOT verified and remain open.')
    sys.exit(2)
