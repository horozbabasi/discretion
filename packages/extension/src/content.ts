/**
 * Content script.
 *
 * SCOPE OF THIS SLICE, stated so its limits are not mistaken for its design.
 * M9 builds the extension in steps. This step establishes the adapter
 * subsystem: site identification, the input witness, continuous health
 * monitoring, and the observable diagnostic. It deliberately does NOT intercept
 * submits yet, because detection is not wired in yet, and a submit interceptor
 * with nothing behind it could only do one of two wrong things — block every
 * send, or wave sends through while looking like protection. Interception lands
 * together with the detection pipeline, and the binding gate it will call
 * (verifyBinding) is already built and tested.
 *
 * SPEC.md: "1. Identify site, load adapter, run healthCheck, warm the NER
 * worker" — the first three are here; worker warming arrives with the worker.
 */

import type { HealthReport } from './adapters/index.js';
import { InputWitness, pickAdapter } from './adapters/index.js';
import type { SiteAdapter } from './adapters/index.js';
import type { ExtensionMessage, HealthMessage } from './messages.js';
import { buildDiagnostic, markScriptStart } from './diagnostics.js';
import { loadDebugPreference, renderDiagnostic, renderUnsupported } from './debug.js';

const HEALTH_INTERVAL_MS = 15_000;

/**
 * Early re-checks, in milliseconds after the content script starts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THESE EXIST: run_at is `document_idle`, and for a single-page app that
 * is BEFORE the application bootstraps and paints. The first check therefore
 * runs against an empty shell, finds nothing, and reports `not-found` —
 * which is indistinguishable from a stale selector.
 *
 * The first version of this reported ONLY on a change of `health.ok`, so a
 * page that failed at document_idle and stayed failing was reported once, from
 * the shell, and never again. Whoever read that console was looking at a
 * snapshot of a page that no longer existed, with nothing saying so.
 *
 * These re-checks let the app paint before the reading is believed, and the
 * forensics stamp every reading with readyState, elapsed time and DOM element
 * count so a shell reading is recognisable as one.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SETTLE_CHECKS_MS = [400, 1_200, 3_000, 6_000, 12_000];

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

/**
 * What the console has already been told.
 *
 * Re-emitting on a change of VERDICT rather than only of `ok` is what lets a
 * shell reading be superseded by a real one: "not-found with 312 elements" and
 * "not-found with 4,180 elements" are different verdicts about different
 * pages, and the second is the one worth reading.
 */
function verdictOf(adapter: SiteAdapter, doc: Document): string {
  const composer = adapter.getComposer();
  const painted = doc.querySelectorAll('*').length;
  // Bucketed, so ordinary DOM churn does not re-emit on every poll.
  const paintBucket = Math.floor(Math.log2(Math.max(1, painted)));
  return composer.ok
    ? `ok:${composer.value.strategyId}:${composer.value.tier}`
    : `fail:${composer.failure.kind}:${paintBucket}`;
}

function start(): void {
  markScriptStart();

  const witness = new InputWitness(document);
  witness.start();

  const adapter = pickAdapter(location.href, document, witness);
  if (adapter === null) {
    report({ kind: 'unsupported-site' });
    renderUnsupported(location.href);
    return;
  }

  let lastOk: boolean | null = null;
  let lastVerdict: string | null = null;
  let lastUrl = location.href;

  const check = (): void => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastOk = null; // Force a report: the composer is re-created on navigation.
      lastVerdict = null;
    }
    const health = adapter.healthCheck();

    // The service worker only needs state transitions: it drives a badge.
    if (health.ok !== lastOk) {
      lastOk = health.ok;
      report(summarise(health));
    }

    // The console needs more than that. A verdict change includes "still
    // failing, but the page has painted since I last looked", which is the
    // difference between a shell reading and a real one.
    const verdict = verdictOf(adapter, document);
    if (verdict !== lastVerdict) {
      lastVerdict = verdict;
      renderDiagnostic(buildDiagnostic(adapter, document));
    }
  };

  check();
  for (const delay of SETTLE_CHECKS_MS) setTimeout(check, delay);
  const timer = setInterval(check, HEALTH_INTERVAL_MS);

  // The stored preference may switch debug off for a packed install, or on for
  // a user reporting a broken site. Storage is async, so the first report above
  // has already used the unpacked-load default; this refines everything after.
  void loadDebugPreference();

  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    witness.stop();
  });
  // SPA navigation fires popstate; conversation switches that use pushState do
  // not, which is why the poll also compares the URL.
  window.addEventListener('popstate', () => setTimeout(check, 0));
}

start();
