# Verifies a site adapter against the LIVE site.
#
# Fixtures establish that the adapter's logic is correct on page shapes we know
# about. Only this establishes that the site still has those shapes — the
# distinction ADAPTER-VERIFICATION.md calls Claim A versus Claim B. Building
# the fixture harness first and never exercising the live one would leave the
# whole of Claim B unchecked.
#
# Opens a real browser with a PERSISTENT profile of its own (never the
# operator's main Edge profile), so a sign-in survives between runs and nothing
# reads the operator's existing browsing data.
#
# Usage:
#   python packages/extension/scripts/verify-live.py claude
#   python packages/extension/scripts/verify-live.py chatgpt
#   python packages/extension/scripts/verify-live.py gemini
#
# The report is STRUCTURAL ONLY: tags, counts, tiers, strategy ids, text
# lengths. No page text, no conversation ids. See src/devtools/liveProbe.ts.
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# How long to give the operator to sign in and type.
WAIT_SECONDS = 900

ROOT = Path(__file__).resolve().parent.parent
PROBE = ROOT / '.probe' / 'live-probe.js'
PROFILE = ROOT / '.probe' / 'profile'

SITES = {
    'claude': 'https://claude.ai/new',
    'chatgpt': 'https://chatgpt.com/',
    'gemini': 'https://gemini.google.com/app',
}

site = sys.argv[1] if len(sys.argv) > 1 else 'claude'
if site not in SITES:
    print(f'unknown site {site!r}; expected one of {sorted(SITES)}')
    sys.exit(1)

print('building the live probe from the real adapter sources...')
built = subprocess.run(
    ['node', str(ROOT / 'scripts' / 'build-live-probe.mjs')],
    cwd=str(ROOT), capture_output=True, text=True,
)
print(built.stdout.strip() or built.stderr.strip())
if built.returncode != 0 or not PROBE.is_file():
    print('FAIL: probe did not build')
    sys.exit(1)

probe_source = PROBE.read_text(encoding='utf-8')
PROFILE.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE),
        channel='msedge',
        headless=False,
        viewport={'width': 1400, 'height': 950},
    )
    # document-start, so the input witness sees everything typed afterwards.
    ctx.add_init_script(probe_source)

    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(SITES[site], wait_until='domcontentloaded')

    print()
    print('=' * 70)
    print(f'  A browser window is open on {SITES[site]}')
    print()
    print('  1. Sign in if asked. Use a throwaway account if you have one.')
    print('  2. Get to a page with the composer visible.')
    print('  3. TYPE SOMETHING SYNTHETIC into the composer - never anything')
    print('     real, and do not send it. Typing is what gives the input')
    print('     witness something to have observed.')
    print()
    print('  This script then continues on its own. Nothing is sent, nothing')
    print('  is typed on your behalf, and no page text is captured.')
    print('=' * 70, flush=True)

    # Polls rather than waiting on stdin, so the run needs no terminal
    # interaction: the operator types in the browser and the script notices.
    report = None
    last_state = None
    for _ in range(int(WAIT_SECONDS / 2)):
        try:
            candidate = page.evaluate('() => (window.__PS_PROBE__ ? window.__PS_PROBE__() : null)')
        except Exception:  # noqa: BLE001  (navigation mid-evaluate is routine here)
            page.wait_for_timeout(2000)
            continue
        if candidate is None:
            page.wait_for_timeout(2000)
            continue

        c = candidate['composer']
        state = (c['resolved'], c['failureKind'], c['textLength'])
        if state != last_state:
            last_state = state
            if c['resolved']:
                print(f"  ... composer resolved ({c['tier']}/{c['strategyId']}), "
                      f"{c['textLength']} chars typed - waiting for text", flush=True)
            else:
                print(f"  ... composer not resolved yet: {c['failureKind']}", flush=True)

        # The report is only complete once something has been typed: the
        # witness check is the part fixtures cannot establish.
        if c['resolved'] and (c['textLength'] or 0) > 0:
            report = candidate
            break
        page.wait_for_timeout(2000)

    if report is None:
        # Take the last observation anyway - "the composer never resolved" is
        # itself the finding, and reporting nothing would hide it.
        try:
            report = page.evaluate('() => (window.__PS_PROBE__ ? window.__PS_PROBE__() : null)')
        except Exception:  # noqa: BLE001
            report = None
        print('  (timed out waiting for typed text; reporting last observation)', flush=True)

    ctx.close()

if report is None:
    print('FAIL: the probe was not installed (init script did not run)')
    sys.exit(1)

print()
print(json.dumps(report, indent=2))

c = report['composer']
ok = c['resolved'] and report['health']['ok']
print()
print('-' * 70)
if c['resolved']:
    print(f"composer RESOLVED at the '{c['tier']}' tier via {c['strategyId']}")
else:
    print(f"composer NOT RESOLVED: {c['failureKind']} - {c['failureDetail']}")
if report['witnessWorks'] is True:
    print('input witness: OK (the resolved composer is the one input was seen on)')
elif report['witnessWorks'] is False:
    print('input witness: MISMATCH - the resolved node is not the one input was seen on')
else:
    print('input witness: not exercised (composer was empty - nothing was typed)')
print(f"health: {'OK' if report['health']['ok'] else 'DEGRADED'} "
      f"failures={report['health']['failures']} warnings={report['health']['warnings']}")
print('-' * 70)
sys.exit(0 if ok else 2)
