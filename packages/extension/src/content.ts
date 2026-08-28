/**
 * Content script.
 *
 * SCOPE OF THIS SLICE, stated so its limits are not mistaken for its design.
 * M9 builds the extension in steps. This step establishes the adapter
 * subsystem: site identification, the input witness, and continuous health
 * monitoring. It deliberately does NOT intercept submits yet, because
 * detection is not wired in yet, and a submit interceptor with nothing behind
 * it could only do one of two wrong things — block every send, or wave sends
 * through while looking like protection. Interception lands together with the
 * detection pipeline in the next step, and the binding gate it will call
 * (verifyBinding) is already built and tested.
 *
 * SPEC.md: "1. Identify site, load adapter, run healthCheck, warm the NER
 * worker" — the first three of those are here; worker warming arrives with the
 * worker.
 */

import type { HealthReport } from './adapters/index.js';
import { InputWitness, pickAdapter } from './adapters/index.js';
import type { ExtensionMessage, HealthMessage } from './messages.js';

const HEALTH_INTERVAL_MS = 15_000;

function report(message: ExtensionMessage): void {
  // The service worker may be asleep or the extension context invalidated by a
  // reload; neither is worth surfacing to the user, and an unhandled rejection
  // in a content script is noisy on the host page.
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

function summarise(report_: HealthReport): HealthMessage {
  return {
    kind: 'health',
    ok: report_.ok,
    // Codes and targets only. Failure details are written to never contain
    // page text, but sending only the structured fields means a future careless
    // edit to a detail string cannot leak content across the message boundary.
    failures: report_.failures.map((f) => ({ kind: f.kind, target: f.target })),
    warnings: report_.warnings.map((w) => ({ target: w.target, tier: w.tier })),
    checkedAt: report_.checkedAt,
  };
}

function start(): void {
  const witness = new InputWitness(document);
  witness.start();

  const adapter = pickAdapter(location.href, document, witness);
  if (adapter === null) {
    report({ kind: 'unsupported-site' });
    return;
  }

  let lastOk: boolean | null = null;
  let lastUrl = location.href;
  const check = (): void => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastOk = null; // Force a report: the composer is re-created on navigation.
    }
    const health = adapter.healthCheck();
    // Report every transition, plus the first result. Reporting every poll
    // would be 4 messages a minute per tab for no added information.
    if (health.ok !== lastOk) {
      lastOk = health.ok;
      report(summarise(health));
    }
  };

  check();
  const timer = setInterval(check, HEALTH_INTERVAL_MS);

  // SPA navigation: claude.ai swaps conversations without a document load, and
  // the composer is re-created when it does. Re-checking on navigation catches
  // a composer that vanished, rather than waiting up to a full poll interval
  // holding a detached handle.
  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    witness.stop();
  });
  // SPA navigation fires popstate; conversation switches that use pushState do
  // not, which is why the poll also compares the URL.
  window.addEventListener('popstate', () => setTimeout(check, 0));
}

start();
