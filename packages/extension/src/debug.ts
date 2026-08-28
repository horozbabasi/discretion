/**
 * The observable surface: renders an adapter diagnostic to the page console.
 *
 * DEFAULT-ON FOR AN UNPACKED LOAD, off for a store install unless the user
 * turns it on. The reasoning:
 *
 * - An unpacked load is a developer or a reviewer verifying the extension, and
 *   ADAPTER-VERIFICATION.md's manual procedure is exactly "load unpacked, open
 *   the site, read the console". Requiring a flag first would mean the default
 *   development experience is the silent one that caused this module to exist.
 * - A store install is a normal user, whose console should not be written to
 *   without reason. They can enable it when reporting a broken site.
 *
 * Chrome injects `update_url` into the manifest it returns for a store
 * install, and does not for an unpacked one. That is the standard way to tell
 * them apart and needs no extra permission.
 *
 * NOTHING HERE PRINTS PAGE TEXT. diagnostics.ts guarantees that at the source;
 * this module only formats what it is given.
 */

import type { AdapterDiagnostic, EnvironmentForensics } from './diagnostics.js';

const STORAGE_KEY = 'debugLogging';
const PREFIX = 'PrivacyShield';

let overrideEnabled: boolean | null = null;

/** True when this is an unpacked (development) load. */
function isUnpackedLoad(): boolean {
  try {
    return chrome.runtime.getManifest().update_url === undefined;
  } catch {
    return false;
  }
}

export function isDebugEnabled(): boolean {
  return overrideEnabled ?? isUnpackedLoad();
}

/**
 * Reads the user's explicit preference, if any.
 *
 * Storage is async, so the first report is emitted on the unpacked default and
 * this refines it afterwards. Losing the flag for one report is better than
 * delaying every report behind an await — the report is most useful when it
 * lands at the moment the page settles.
 */
export async function loadDebugPreference(): Promise<void> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_KEY)) as Record<string, unknown>;
    const value = stored[STORAGE_KEY];
    if (typeof value === 'boolean') overrideEnabled = value;
  } catch {
    // Storage unavailable: keep the unpacked-load default rather than failing.
  }
}

function verdictLine(diagnostic: AdapterDiagnostic): string {
  const { composer, health } = diagnostic;
  if (!health.ok) return `DEGRADED — sends will be blocked`;
  if (composer.tier !== 'attribute') return `WORKING, but only at the '${composer.tier}' tier`;
  return 'WORKING';
}

/**
 * Prints the diagnostic.
 *
 * Uses a collapsed group so it is one line until expanded: a content script
 * that floods the console gets muted by whoever is trying to debug their own
 * page, which would restore the silence this exists to remove.
 */
export function renderDiagnostic(diagnostic: AdapterDiagnostic): void {
  if (!isDebugEnabled()) return;

  const { composer, responseRoot, health } = diagnostic;
  console.groupCollapsed(
    `${PREFIX} [${diagnostic.displayName}] ${verdictLine(diagnostic)} — click to expand`,
  );

  console.log(
    `site=${diagnostic.site} path=${diagnostic.path} checkedAt=${new Date(health.checkedAt).toISOString()}`,
  );

  for (const element of [composer, responseRoot]) {
    if (element.resolved) {
      console.log(
        `${element.target}: RESOLVED by '${element.strategyId}' at the '${element.tier}' tier ` +
          `(${element.ambiguityCount} candidate${element.ambiguityCount === 1 ? '' : 's'} admitted)`,
      );
    } else {
      console.warn(
        `${element.target}: NOT RESOLVED — ${element.failureKind}: ${element.failureDetail}`,
      );
    }
    // Every strategy, including the ones that matched nothing: knowing which
    // markers have disappeared is what tells you how a site changed.
    console.table(
      element.strategies.map((s) => ({
        strategy: s.id,
        tier: s.tier,
        matched: s.matched,
        admitted: s.admitted,
        rejectedBy: Object.entries(s.rejectedBy)
          .map(([id, n]) => `${id}×${n}`)
          .join(', '),
      })),
    );
  }

  if (health.failures.length > 0) {
    console.warn(`${PREFIX}: healthCheck FAILED`);
    for (const failure of health.failures) {
      console.warn(`  ${failure.target}: ${failure.kind} — ${failure.detail}`);
      console.warn(`    strategies tried: ${failure.triedStrategies.join(', ')}`);
    }
  } else {
    console.log('healthCheck: ok, no failures');
  }

  for (const warning of health.warnings) {
    console.warn(`  warning ${warning.target} (${warning.tier}): ${warning.detail}`);
  }

  if (diagnostic.forensics !== null) renderForensics(diagnostic.forensics, diagnostic);

  console.groupEnd();
}

/**
 * Prints the failure forensics, and says what they mean.
 *
 * "Every strategy matched 0" looks the same whether the composer moved, sits
 * behind a closed shadow root, or lives in a frame we cannot enter — and those
 * need completely different responses. This is the part that tells them apart,
 * so it states an interpretation rather than only numbers: a table nobody can
 * read is barely better than the silence this replaced.
 */
/**
 * Whether the page has painted, derived FROM THE PROBE DATA ITSELF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT AN ELEMENT COUNT ANY MORE.
 *
 * The first version gated on `domElementCount < 400`. That number was
 * invented, never measured, and wrong: `querySelectorAll('*')` counts LIGHT
 * DOM only, and a componentised Angular application with a short conversation
 * sits comfortably under 400 nodes while fully painted. It withheld the
 * reading on a page showing 6 buttons, a rich-textarea, 34 custom elements and
 * 2 editable surfaces.
 *
 * That is the mirror of the defect the gate was built to fix. The previous
 * instrument concluded when it should not have; this one refused when it
 * should have concluded. Both produce unusable readings, and both came from
 * the same mistake: A GATE THAT CAN CONTRADICT THE DATA IT GATES.
 *
 * So the gate is now DERIVED from that data. If the probes found controls,
 * editable surfaces or custom elements, the page has rendered — no proxy can
 * disagree with that, because there is no longer a separate proxy to disagree.
 * The element count is still reported, as context; it decides nothing.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function paintEvidence(f: EnvironmentForensics): {
  controls: number;
  editables: number;
  customElements: number;
  painted: boolean;
} {
  const controls =
    (f.probes['button']?.deep ?? 0) + (f.probes['[role="button"]']?.deep ?? 0);
  const editables = f.editableCandidates.length;
  const customElements = f.customElements.length;
  return {
    controls,
    editables,
    customElements,
    // ANY positive evidence of rendering is enough. A page cannot be
    // simultaneously un-painted and showing six buttons.
    painted: controls > 0 || editables > 0 || customElements > 0,
  };
}

function renderForensics(f: EnvironmentForensics, diagnostic: AdapterDiagnostic): void {
  console.warn('environment forensics (emitted because health was not ok):');
  const evidence = paintEvidence(f);
  console.log(
    `reading #${f.attempt} at ${f.msSinceScriptStart}ms, readyState=${f.readyState}, ` +
      `${f.domElementCount} elements | paint evidence: ${evidence.controls} controls, ` +
      `${evidence.editables} editable surfaces, ${evidence.customElements} custom elements ` +
      `-> ${evidence.painted ? 'PAINTED' : 'NOT PAINTED'}`,
  );
  if (!evidence.painted) {
    console.warn(
      'NOTHING HAS RENDERED — no controls, no editable surfaces, no custom elements. ' +
        'Every "matched 0" below is meaningless. Wait for a later reading.',
    );
  }
  console.log(
    `open shadow roots: ${f.openShadowRoots} (max depth ${f.maxShadowDepth}) | iframes: ${f.iframes}`,
  );
  console.table(
    Object.entries(f.probes).map(([selector, counts]) => ({
      selector,
      'light DOM': counts.light,
      'incl. shadow': counts.deep,
      'only in shadow': counts.deep - counts.light,
    })),
  );
  if (f.likelyClosedShadowHosts.length > 0) {
    console.warn(
      `LIKELY CLOSED SHADOW ROOTS: ${f.likelyClosedShadowHosts.join(', ')} — these render but ` +
        'expose no children and no shadowRoot. A closed root cannot be reached by any supported ' +
        'means, so if the composer is inside one this adapter can never resolve it.',
    );
  }
  if (f.customElements.length > 0) {
    console.log(`custom elements present: ${f.customElements.join(', ')}`);
  }

  // Every editable surface on the page, described structurally. This is what
  // answers "is that lone textarea the composer, or a hidden form field?" —
  // both count as 1 in the probe table.
  if (f.editableCandidates.length > 0) {
    console.log('editable surfaces found:');
    console.table(
      f.editableCandidates.map((c) => ({
        tag: c.tag,
        type: c.type ?? '',
        visible: c.visible,
        editable: c.editable,
        disabled: c.disabled,
        readOnly: c.readOnly,
        chars: c.textLength,
        ancestors: c.ancestors.slice(0, 4).join(' < '),
        attributes: c.attributes.join(' '),
        failsInvariants: c.failsInvariants.join(', '),
      })),
    );
  } else {
    console.warn('NO editable surface anywhere, light DOM or shadow.');
  }

  if (f.controlCandidates.length > 0) {
    console.log('plausible submit controls (found WITHOUT assuming a <button> tag):');
    console.table(
      f.controlCandidates.map((c) => ({
        tag: c.tag,
        role: c.role ?? '',
        visible: c.visible,
        matchedBy: c.matchedBy.join(', '),
        ancestors: c.ancestors.slice(0, 4).join(' < '),
        attributes: c.attributes.join(' '),
      })),
    );
    // VISIBILITY MATTERS HERE, and leaving it out produced a misleading
    // warning once already: an invisible <a role="button"> was reported as
    // evidence that the send control is not a button, while a VISIBLE <button>
    // sat in the same list. A hidden candidate is not the send control.
    const visible = f.controlCandidates.filter((c) => c.visible);
    const visibleButtons = visible.filter((c) => c.tag === 'button');
    const visibleNonButtons = visible.filter((c) => c.tag !== 'button');

    if (visibleButtons.length > 0) {
      console.log(
        `${visibleButtons.length} VISIBLE <button> candidate(s) present. If one of these is the ` +
          'send control, the failure is ordinary selector rot — write the selector against the ' +
          'attributes listed above, and do NOT conclude anything about element tags.',
      );
    }
    if (visibleNonButtons.length > 0) {
      console.warn(
        `${visibleNonButtons.length} VISIBLE plausible send control(s) are not <button> ` +
          `(${visibleNonButtons.map((c) => c.tag).join(', ')}).`,
      );
    }
    const hiddenOnly = f.controlCandidates.length - visible.length;
    if (hiddenOnly > 0) {
      console.log(
        `${hiddenOnly} candidate(s) above are NOT VISIBLE and are almost certainly not the send ` +
          'control. Ignore them.',
      );
    }
  }

  // The resolver's own results, restated INSIDE the forensics block. The
  // reading below is a claim about these; printing them together is what makes
  // it checkable without scrolling to another part of the group.
  console.log('resolver results this reading is based on:');
  for (const element of [diagnostic.composer, diagnostic.responseRoot]) {
    const summary = element.strategies
      .map((st) => `${st.id} ${st.matched}/${st.admitted}`)
      .join('  |  ');
    console.log(
      `  ${element.target}: ${element.resolved ? `RESOLVED by ${element.strategyId}` : `NOT RESOLVED (${element.failureKind})`}` +
        `${summary.length > 0 ? ` — ${summary}` : ' — NO STRATEGIES REGISTERED (this is a bug in the diagnostic, not a finding about the page)'}`,
    );
  }

  renderReading(f, diagnostic);
}

/**
 * The READING line.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT MUST ONLY ASSERT WHAT IT ACTUALLY CHECKED.
 *
 * The first version said "visible editable surfaces ARE reachable but NO
 * STRATEGY MATCHED ONE — the selectors are stale" whenever forensics fired and
 * a visible editable existed. It never consulted the resolver. So on a page
 * where the composer had resolved perfectly and only the SEND CONTROL failed,
 * it announced that the composer's selectors were stale — a conclusion about a
 * thing it had not examined, contradicting the strategy table printed a few
 * lines above it.
 *
 * That is standing rule 7 in a new place, and a worse one. A gate on data can
 * be checked against the data. A SUMMARY IS A GATE ON ATTENTION: if it states
 * a conclusion the instrument did not test, it stops the reader looking
 * exactly as a wrong diagnosis does — and it is likelier to be believed,
 * because it reads as the instrument's considered verdict rather than as one
 * more number.
 *
 * The rule this now follows: every branch below is keyed on
 * `diagnostic.composer` — the RESOLVER'S OWN RESULT — and the reading names
 * what actually failed rather than assuming which element it was.
 * ─────────────────────────────────────────────────────────────────────────
 */
function renderReading(f: EnvironmentForensics, diagnostic: AdapterDiagnostic): void {
  const evidence = paintEvidence(f);
  const composer = diagnostic.composer;
  const anyEditable = f.editableCandidates.length;
  const usableEditable = f.editableCandidates.filter((c) => c.visible && c.editable).length;
  const controls = evidence.controls;
  const failedTargets = diagnostic.health.failures.map((x) => x.target);

  if (!evidence.painted) {
    console.warn('READING: withheld — nothing had rendered. Not a selector conclusion.');
    return;
  }

  // THE COMPOSER RESOLVED. Nothing may be said about its selectors here.
  if (composer.resolved) {
    console.warn(
      `READING: the composer RESOLVED (by '${composer.strategyId}' at the '${composer.tier}' ` +
        `tier). These forensics are about the OTHER failure(s): ` +
        `${failedTargets.length > 0 ? failedTargets.join(', ') : 'none reported'}. ` +
        'Nothing here is evidence about the composer selectors.',
    );
    if (failedTargets.includes('send-button') || failedTargets.includes('submit-control')) {
      console.warn(
        controls === 0
          ? 'The send control failed and NO control of any kind was found. Suspect the page ' +
              'state, not the selectors.'
          : `The send control failed while ${controls} control(s) exist on the page. Compare the ` +
              'control-candidate table above against this adapter\'s send selectors: this is ' +
              'most likely ordinary selector rot on that one element.',
      );
    }
    return;
  }

  // THE COMPOSER DID NOT RESOLVE. Now the resolver's own failure kind leads.
  const kind = composer.failureKind;
  if (kind === 'ambiguous') {
    console.warn(
      `READING: the composer was AMBIGUOUS (${composer.ambiguityCount} candidates admitted), ` +
        'not missing. Do not touch the selectors to make one win — find what the second ' +
        'candidate is and why it is admissible.',
    );
    return;
  }
  if (kind === 'invariant') {
    console.warn(
      'READING: candidates were FOUND and every one was rejected by an invariant. The selectors ' +
        'are finding something; the strategy table names which invariant rejected it.',
    );
    return;
  }

  if (controls === 0) {
    console.warn(
      'READING: no button and no [role="button"] anywhere on a painted page. Not credible for a ' +
        'chat UI — treat this whole block as suspect rather than as evidence about selectors.',
    );
  } else if (anyEditable === 0 && f.likelyClosedShadowHosts.length > 0) {
    console.warn(
      'READING: no editable surface is reachable and closed shadow roots are present. The ' +
        'composer is probably UNREACHABLE, not moved.',
    );
  } else if (anyEditable === 0 && f.iframes > 0) {
    console.warn(
      'READING: no editable surface is reachable and frames are present. The composer may be in ' +
        'a frame; the manifest sets all_frames:false.',
    );
  } else if (usableEditable > 0) {
    console.warn(
      `READING: the composer did NOT resolve (${kind}), and ${usableEditable} visible, editable ` +
        'surface(s) ARE reachable. THE SELECTORS ARE STALE, not the query mechanism. The ' +
        'editable table says what to write them against.',
    );
  } else if (anyEditable > 0) {
    console.warn(
      `READING: ${anyEditable} editable surface(s) exist but none is both visible and editable — ` +
        'they may be hidden form fields rather than the composer.',
    );
  } else {
    console.warn(
      'READING: no editable surface reachable and no closed-root or frame signal. Inconclusive.',
    );
  }
}

/** Announces that no adapter claimed this page. */
export function renderUnsupported(url: string): void {
  if (!isDebugEnabled()) return;
  console.log(`${PREFIX}: no adapter claims ${new URL(url).hostname}; not active on this page.`);
}
