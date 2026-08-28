# Playwright driver for the browser-side latency benchmark.
#
# HEADLESS defaults to 1. Note that Playwright injects
# --enable-unsafe-swiftshader in headless mode, which is a SOFTWARE
# rasterizer: any WebGPU number measured headless is a measurement of
# SwiftShader, not of the GPU. Run with HEADLESS=0 to measure the real
# adapter.
from playwright.sync_api import sync_playwright
import json, sys, os, time, subprocess


def machine_conditions():
    """Observable machine state at measurement time.

    Recorded on EVERY run because of the mistake this benchmark already made
    once: a 4-6x swing was observed, attributed to mains-versus-battery, and
    later refuted by a direct test on battery. The variable was some power or
    performance mode that was never captured, so the result could not be
    reproduced or explained after the fact.

    Standing rule: a measurement that does not record its conditions is not a
    measurement of the software. These fields are the cheap proxies available
    without extra tooling; they are not a complete description of the machine's
    power state, and the report says so rather than implying they are.
    """
    ps = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "$p=[System.Windows.Forms.SystemInformation]::PowerStatus;"
        "$c=Get-CimInstance Win32_Processor;"
        r"$perf=try{(Get-Counter '\Processor Information(_Total)\% Processor Performance').CounterSamples[0].CookedValue}catch{-1};"
        "[pscustomobject]@{powerLine=[string]$p.PowerLineStatus;"
        "batteryPercent=[math]::Round($p.BatteryLifePercent*100);"
        "chargeStatus=[string]$p.BatteryChargeStatus;"
        "currentClockMHz=$c.CurrentClockSpeed;maxClockMHz=$c.MaxClockSpeed;"
        "cpuLoadPercent=$c.LoadPercentage;"
        "processorPerformancePercent=[math]::Round($perf,1);"
        "cpu=$c.Name} | ConvertTo-Json -Compress"
    )
    try:
        out = subprocess.run(['powershell', '-NoProfile', '-Command', ps],
                             capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout.strip())
    except Exception as exc:  # noqa: BLE001
        return {'error': f'{type(exc).__name__}'}

DEVICE = os.environ.get('DEVICE', 'wasm')
WINDOWS = os.environ.get('WINDOWS', '')
HEADLESS = os.environ.get('HEADLESS', '1') != '0'

args = ['--enable-unsafe-webgpu', '--enable-features=Vulkan']

CONDITIONS_BEFORE = machine_conditions()
print('conditions before: ' + json.dumps(CONDITIONS_BEFORE), flush=True)

with sync_playwright() as p:
    # Edge occasionally fails to hand back its first process; retry rather
    # than lose a 20-minute run to a transient launch failure.
    b = None
    for attempt in range(3):
        try:
            b = p.chromium.launch(headless=HEADLESS, channel='msedge', args=args)
            break
        except Exception as e:
            print(f'launch attempt {attempt + 1} failed: {type(e).__name__}', flush=True)
            time.sleep(3)
    if b is None:
        print('FAILED: browser would not launch after 3 attempts')
        sys.exit(1)

    page = b.new_page()
    page.on('console', lambda m: print('  [console]', m.text) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: print('  [pageerror]', e))
    page.on('response', lambda r: print('  [http]', r.status, r.url) if r.status >= 400 else None)
    page.on('requestfailed', lambda r: print('  [reqfail]', r.url, r.failure))

    # Report what the browser actually resolved the adapter to, so a software
    # fallback is visible in the output instead of being reported as WebGPU.
    url = 'http://localhost:5211/?device=' + DEVICE + (('&windows=' + WINDOWS) if WINDOWS else '')
    page.goto(url, wait_until='domcontentloaded')
    print('url: ' + url, flush=True)
    adapter = page.evaluate("""async () => {
        if (!navigator.gpu) return { webgpu: false };
        const a = await navigator.gpu.requestAdapter();
        if (!a) return { webgpu: true, adapter: null };
        const i = a.info ?? (a.requestAdapterInfo ? await a.requestAdapterInfo() : {});
        return { webgpu: true, vendor: i.vendor, architecture: i.architecture,
                 device: i.device, description: i.description };
    }""")
    print('adapter: ' + json.dumps(adapter), flush=True)
    print(f'headless: {HEADLESS}', flush=True)

    try:
        page.wait_for_selector('#out[data-done="1"]', timeout=1_800_000)
    except Exception:
        print(page.locator('#out').inner_text())
        b.close()
        sys.exit(1)

    res = page.evaluate('window.__BENCH__')
    res['adapter'] = adapter
    res['headless'] = HEADLESS
    res['conditionsAfter'] = machine_conditions()
    res['conditionsBefore'] = CONDITIONS_BEFORE
    print(json.dumps(res, indent=2))
    b.close()
