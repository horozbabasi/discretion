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

/** The extension's own injected host. Never evidence about the page. */
const SURFACE_HOST_TAG = 'privacyshield-surface';

import {
  lastRegionAdmission,
  lastSubmitPath,
  recentIntents,
} from './adapters/index.js';
import { lastComposerRegionWalk } from './adapters/claude.js';

/** Mirrors REGION_HOP_LIMIT in claude.ts, for the reading only. */
const REGION_HOP_LIMIT_FOR_DISPLAY = 8;
import type { SubmitPathEntry } from './adapters/index.js';
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
export function renderDiagnostic(diagnostic: AdapterDiagnostic, forced = false): void {
  if (!isDebugEnabled()) return;

  const { composer, responseRoot, health } = diagnostic;
  console.groupCollapsed(
    // A FORCED reading is labelled as one. The passive log emits only on a
    // VERDICT CHANGE, so pressing the shortcut when nothing has changed
    // produced a block identical to the ones already on screen - and the only
    // report back was "the shortcut did nothing". It did; it was
    // indistinguishable.
    `${PREFIX} [${diagnostic.displayName}] ${verdictLine(diagnostic)}` +
      `${forced ? ' — FORCED by Ctrl+Alt+Shift+P' : ''} — click to expand`,
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
  // OUR OWN HOST IS NOT EVIDENCE THE PAGE PAINTED, and counting it was
  // circular: `privacyshield-surface` is mounted by this extension, on every
  // page, before anything is measured - so `painted` was true by construction
  // and the gate could never report NOT PAINTED once we had attached.
  //
  // Measured on claude.ai, 2026-09-02: reading #1 at 7 ms, readyState
  // "interactive", 126 elements, zero controls, and it declared PAINTED on the
  // strength of "1 custom elements" - which was us. A DEGRADED verdict went
  // out from an unpainted shell, which is precisely the failure the paint gate
  // was built to prevent.
  const customElements = f.customElements.filter((name) => name !== SURFACE_HOST_TAG).length;
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
  if (f.iconNames.length > 0) {
    console.log(`mat-icon ligature names present: ${f.iconNames.join(', ')}`);
  }

  if (f.sendSearch !== null) {
    const search = f.sendSearch;
    console.log(
      `composer-anchored send search: ${search.outcome} ` +
        `(stopped because ${search.stoppedBecause}; ` +
        `${search.regionControls} control(s) in the chosen region)`,
    );
    console.log(
      `document-wide controls: ${search.documentControls.raw} matched CONTROL_SELECTOR, ` +
        `${search.documentControls.rendered} of them rendered`,
    );
    if (search.steps.length > 0) {
      // THE WHOLE FILTER CHAIN, not just the survivors. A single count cannot
      // say whether a control was never matched or was matched and discarded,
      // and those have opposite fixes.
      console.table(
        search.steps.map((step) => ({
          hop: step.hop,
          element: step.marker,
          raw: step.rawMatched,
          'not composer': step.afterComposerExclusions,
          rendered: step.afterRenderedFilter,
          new: step.newlyCollected,
          total: step.runningTotal,
        })),
      );
      const last = search.steps[search.steps.length - 1];
      if (last !== undefined && last.runningTotal < search.documentControls.rendered) {
        console.warn(
          `The walk collected ${last.runningTotal} of ${search.documentControls.rendered} ` +
            'rendered controls on the page. If the send control is among the ones it never ' +
            'reached, no discriminator can help - compare the raw column against the rendered ' +
            'column to see which stage removed them.',
        );
      }
    }
    if (search.iconHosts.length > 0) {
      // Which control encloses each icon, and whether CONTROL_SELECTOR even
      // recognises it. An icon inside something the selector does not match is
      // invisible to every clause, however well the walk works.
      console.log('icons and their enclosing controls:');
      console.table(
        search.iconHosts.map((h) => ({
          icon: h.iconName,
          parent: h.parentTag,
          enclosingControl: h.enclosingControlTag ?? 'NONE',
          role: h.enclosingControlRole ?? '',
          matchedBySelector: h.matchedByControlSelector,
          inCollectedSet: h.enclosingControlInCollectedSet,
          controlAttributes: h.enclosingControlAttributes.join(' '),
        })),
      );

      // ANCESTORS ARE ALWAYS PRINTED.
      //
      // They were gated on "no control encloses this icon", which emitted them
      // precisely when they were least useful and withheld them from the
      // reading that mattered: on a page where the other controls ARE real
      // buttons, nothing is unmatched, so nothing printed - and the enclosing
      // control is exactly what a positive clause gets written against. Same
      // family as the forensics once gated on composer resolution. Three
      // icons, one small table each; there is no cost worth gating for.
      for (const host of search.iconHosts) {
        console.log(
          `ancestors of <mat-icon>${host.iconName}</mat-icon>` +
            (host.enclosingControlTag === null
              ? ' (NO enclosing control)'
              : ` (inside <${host.enclosingControlTag}>)`) +
            ':',
        );
        console.table(
          host.ancestors.map((a) => ({
            tag: a.tag,
            custom: a.isCustomElement,
            role: a.role ?? '',
            tabindex: a.tabIndex ?? '',
            ariaLabel: a.ariaLabelPresent,
            cursorPointer: a.cursorPointer,
            inlineHandler: a.hasInlineHandler,
            formAssoc: a.formAssociated,
            disabled: a.disabledState ?? '',
            attributes: a.attributes.join(' '),
          })),
        );
      }

      const unmatched = search.iconHosts.filter((h) => !h.matchedByControlSelector);
      const unreachable = search.iconHosts.filter(
        (h) => h.matchedByControlSelector && !h.enclosingControlInCollectedSet,
      );
      if (unmatched.length > 0) {
        console.warn(
          `${unmatched.length} icon(s) have NO enclosing control that CONTROL_SELECTOR matches ` +
            `(${unmatched.map((h) => h.iconName).join(', ')}) - so no clause and no fallback can ` +
            'reach them. The chains above are what identifies the real control.',
        );
      }
      if (unreachable.length > 0) {
        console.warn(
          `${unreachable.length} icon(s) sit inside a RECOGNISED control that the walk never ` +
            `COLLECTED (${unreachable.map((h) => h.iconName).join(', ')}). That is a DIFFERENT ` +
            'failure from "not a control": the element is findable and the collection did not ' +
            'reach it.',
        );
      }
      console.warn(
        'NOTE: listeners attached with addEventListener are NOT observable from a content ' +
          'script (getEventListeners is devtools-only), so "has a click handler" is absent from ' +
          'these columns by necessity. An ancestor with no role, no durable tag, no tabindex and ' +
          'no form association is exposed by nothing a selector or a screen reader can find - ' +
          'which is a finding about the site, not a selector to write harder.',
      );
    }
    if (search.outcome === 'no-region' && search.stoppedBecause !== 'no-composer') {
      console.warn(
        'The walk found NO region containing a control beside the composer. Either it ' +
          'terminated before reaching the composer toolbar (a bound too tight), or the toolbar ' +
          'genuinely holds no control. The hop table above says which: compare the last element ' +
          'reached against the composer\'s real container.',
      );
    }
    if (search.regionControlDetail.length > 0) {
      console.log("controls in the composer's region (this is what a discriminator is designed against):");
      console.table(
        search.regionControlDetail.map((c) => ({
          tag: c.tag,
          role: c.role ?? '',
          accessibleName: c.accessibleName ?? '',
          sendIcon: c.hasSendIcon,
          visible: c.visible,
          attributes: c.attributes.join(' '),
          ancestors: c.ancestors.slice(0, 3).join(' < '),
        })),
      );
    }
    if (search.discriminator !== null) {
      const d = search.discriminator;
      console.log(
        `discriminator: ${d.rule ?? 'NONE FIRED'} — ` +
          d.attempts.map((a) => `${a.rule}:${a.matched}`).join('  '),
      );
    }
    if (search.outcome === 'ambiguous') {
      // TWO HYPOTHESES, BOTH STATED. The previous version said only "the
      // region needs a discriminator", which is a correct inference from a
      // count and can be a wrong conclusion about the page: it silently
      // assumed the send control was among the candidates. On Gemini it was
      // not - the walk had stopped at the tools menu - so all three rules
      // correctly returned zero and the summary pointed at the wrong repair.
      console.warn(
        `${search.regionControls} control(s) were collected and NO rule identified which one ` +
          'sends. There are TWO explanations and this block does not distinguish them:',
      );
      console.warn(
        '  (a) the send control IS among them but carries no discriminable property -> a new ' +
          'POSITIVE rule is needed (never one that excludes the others);',
      );
      console.warn(
        '  (b) the send control is NOT among them -> no discriminator can help, and the ' +
          'collection is what must change. CHECK THE TABLE ABOVE FIRST: if none of the listed ' +
          'controls plausibly sends, it is (b).',
      );
      console.warn(
        'Refusing is correct either way - a wrong send binding has the same consequence as a ' +
          'wrong composer.',
      );
    }
    if (search.outcome === 'discriminated') {
      console.log(
        `The region held ${search.regionControls} controls and the '${search.discriminator?.rule}' ` +
          'rule identified one of them as the send control.',
      );
    }
  }

  // Every editable surface on the page, described structurally. This is what
  // answers "is that lone textarea the composer, or a hidden form field?" —
  // both count as 1 in the probe table.
  if (f.editableCandidates.length > 0) {
    const kinds = [...new Set(f.editableCandidates.map((c) => c.tag))].join(', ');
    const blocked = f.editableCandidates.filter((c) => c.disabled || c.readOnly).length;
    console.log(
      `editable surfaces found (${f.editableCandidates.length}; kinds: ${kinds}` +
        `${blocked > 0 ? `; ${blocked} DISABLED or READONLY` : ''}):`,
    );
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
        ariaHiddenBy: c.ariaHiddenAncestor
          ? `${c.ariaHiddenAncestor.tag} +${String(c.ariaHiddenAncestor.depth)}`
          : '',
      })),
    );

    // Printed SEPARATELY and loudly, because it is the difference between two
    // opposite conclusions. `not-aria-hidden` failing on every candidate can
    // mean the site marks its composer inert, or that our check walks too far
    // up and catches a wrapper that hides nothing. The reading that only says
    // "not-aria-hidden" cannot distinguish them, and that is the reading the
    // live claude.ai failure produced.
    const hidden = f.editableCandidates.filter((c) => c.ariaHiddenAncestor !== null);
    if (hidden.length > 0) {
      console.warn(
        `${String(hidden.length)} editable(s) sit inside an aria-hidden="true" subtree. ` +
          'The ancestor that carries it, and its own attributes:',
      );
      console.table(
        hidden.map((c) => ({
          editable: c.tag,
          hiddenBy: c.ariaHiddenAncestor?.tag ?? '',
          levelsUp: c.ariaHiddenAncestor?.depth ?? 0,
          ancestorAttributes: (c.ariaHiddenAncestor?.attributes ?? []).join(' '),
        })),
      );
      console.warn(
        'If levelsUp is 0 the element itself is marked hidden. If it is large, ' +
          'the attribute is on a distant wrapper and the invariant is very likely ' +
          'rejecting a live composer rather than an inert duplicate.',
      );
    }
  } else {
    console.warn('NO editable surface anywhere, light DOM or shadow.');
  }

  // The last submit attempt, if there has been one this session.
  const submit = lastSubmitPath();
  if (submit.entries.length > 0) {
    const editableOnPath = submit.entries.filter((e: SubmitPathEntry) => e.editable).length;
    console.log(
      `last submit attempt: ${String(submit.entries.length)} node(s) on the composed path, ` +
        `${String(editableOnPath)} editable`,
    );
    console.table(
      submit.entries.map((e: SubmitPathEntry, i: number) => ({
        depth: i,
        tag: e.tag,
        editable: e.editable,
        attributes: e.attributes.join(' '),
      })),
    );
    if (editableOnPath === 0) {
      console.warn(
        'NO editable on the submit path. That is what produces "the submit event did ' +
          'not resolve to exactly one editable element" - the send is refused because ' +
          'which text is about to be sent cannot be established. The table above is ' +
          'what the event actually passed through.',
      );
    }
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
      // SCOPED BY STRATEGY FAMILY. "Most likely ordinary selector rot" was
      // asserted here before, and it explained only the MARKER clauses. A
      // composer-anchored search failing means something else entirely, and
      // saying "rot" over the top of it is a cause asserted for a failure the
      // line did not examine.
      const search = f.sendSearch;
      if (controls === 0) {
        console.warn(
          'The send control failed and NO control of any kind was found on the page. Suspect ' +
            'page state, not selectors.',
        );
      } else {
        console.warn(
          `The send control failed while ${controls} control(s) exist. What that implies differs ` +
            'by strategy family:',
        );
        console.warn(
          `  MARKER/ICON clauses failed -> the declared markers no longer describe the control. ` +
            'Ordinary rot. Write a clause against the control-candidate attributes above.',
        );
        if (search === null) {
          console.warn('  (this adapter has no composer-anchored search)');
        } else if (search.outcome === 'ambiguous') {
          console.warn(
            `  COMPOSER-ANCHORED search found ${search.regionControls} controls in the region and ` +
              'refused. NOT rot - the region needs a discriminator, and rewriting markers will ' +
              'not help it.',
          );
        } else if (search.outcome === 'no-region') {
          console.warn(
            `  COMPOSER-ANCHORED search found no region at all (${search.stoppedBecause}). NOT ` +
              'rot - it never got far enough to look. Check the hop table before touching any ' +
              'selector.',
          );
        } else {
          console.warn('  COMPOSER-ANCHORED search resolved, so the failure is elsewhere.');
        }
      }
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
  // PAGE STATE, and it must be derived from the RESOLVER, not from page-wide
  // aggregates.
  //
  // Two defects were found in the first version of this branch. It was gated
  // on `failureKind === 'invariant'`, which only ever occurs on ChatGPT: that
  // adapter's strategies query raw, so a disabled composer is FOUND then
  // rejected. Gemini's and Claude's strategies call `.filter(isEditableSurface)`
  // INSIDE find(), so the same disabled composer matches zero and reports
  // `not-found` - the identical page condition produces two different failure
  // kinds depending on the adapter. And `onlyEditableFailed` ranged over EVERY
  // editable on the page, so one unrelated 0x0 input failing `rendered`
  // silently suppressed the verdict.
  //
  // Both are now keyed on the composer strategies' own per-strategy rejection
  // records, plus the editable table as corroboration.
  const composerRejections = composer.strategies.flatMap((st) => Object.keys(st.rejectedBy));
  const rejectedOnlyForEditability =
    composerRejections.length > 0 && composerRejections.every((id) => id === 'editable');
  const disabledSurfaces = f.editableCandidates.filter((c) => c.disabled || c.readOnly);

  if (rejectedOnlyForEditability || (kind === 'not-found' && disabledSurfaces.length > 0)) {
    console.warn(
      `READING: the composer appears PRESENT BUT NOT EDITABLE — ` +
        `${disabledSurfaces.length} disabled/readonly surface(s), and every composer-strategy ` +
        'rejection was the `editable` invariant. THIS IS PAGE STATE, NOT SELECTOR ROT: a stale ' +
        'selector matches nothing, whereas this found something and the element\'s state ' +
        'disqualified it. Common causes: a response is generating, the account is rate-limited, ' +
        'or the app is still initialising. Re-read with the composer IDLE before changing any ' +
        'selector.',
    );
    return;
  }

  if (kind === 'invariant') {
    const disabled = disabledSurfaces;
    const onlyEditableFailed = rejectedOnlyForEditability;

    if (disabled.length > 0 && onlyEditableFailed) {
      console.warn(
        `READING: the composer was FOUND and rejected only because it is not currently editable ` +
          `(${disabled.length} disabled/readonly surface(s) present). THIS IS PAGE STATE, NOT ` +
          'SELECTOR ROT — the selectors are working. Common causes: a response is generating, ' +
          'the account is rate-limited, or the app is still initialising. Re-read with the ' +
          'composer IDLE before changing any selector.',
      );
      return;
    }
    console.warn(
      'READING: candidates were FOUND and every one was rejected by an invariant. The selectors ' +
        'are finding something, so this is not rot; the strategy table names which invariant ' +
        'rejected it.',
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

/**
 * Everything the binding gate saw, AT THE MOMENT IT REFUSED.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Every reading before this was a snapshot taken either side of the refusal,
 * and they said the opposite of the refusal: a forced diagnostic run
 * immediately afterwards showed the composer resolving from both strategies
 * with healthCheck ok, while the send in between had been refused for finding
 * "not exactly one editable element".
 *
 * A check that disagrees with the state before it and the state after it is
 * not explained by either. This prints what the decision itself was looking
 * at, in the moment, and it is emitted from the refusal path rather than from
 * a diagnostic the user triggers afterwards.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function renderSubmitRefusal(context: {
  intentKind: string;
  code: string;
  detail: string;
  composerResolved: boolean;
  composerStrategy: string | null;
}): void {
  if (!isDebugEnabled()) return;

  console.groupCollapsed(
    `${PREFIX} SUBMIT REFUSED (${context.code}) via a ${context.intentKind} intent — click to expand`,
  );
  console.warn(context.detail);
  console.log(
    `at the moment of refusal: composer ${context.composerResolved ? 'RESOLVED' : 'NOT resolved'}` +
      `${context.composerStrategy === null ? '' : ` by '${context.composerStrategy}'`}`,
  );

  // WHICH PATH raised it. `undecidable` from a keyboard send should be
  // impossible - when originComposerOfKeyEvent returns null the adapters do
  // not call back, so the event is never intercepted. If a 'key' intent
  // appears here with resolved=false, that reasoning is wrong and this is
  // where it shows.
  const intents = recentIntents();
  if (intents.length > 0) {
    console.log('submit intents raised this session (newest last):');
    console.table(
      intents.map((i: { kind: string; resolved: boolean; atMs: number }) => ({
        kind: i.kind,
        resolvedAComposer: i.resolved,
        msAgo: Date.now() - i.atMs,
      })),
    );
  }

  const region = lastRegionAdmission();
  if (region !== null) {
    console.log(
      `region uniqueness test: <${region.regionTag}> held ${String(region.examined)} candidate(s), ` +
        `${String(region.admitted)} admissible (${String(Date.now() - region.atMs)}ms ago)`,
    );
    if (region.rejected.length > 0) {
      console.log('rejected, and by which invariant:');
      console.table(
        region.rejected.map((r) => ({
          tag: r.tag,
          failed: r.failedInvariants.join(', '),
          attributes: r.attributes.join(' '),
        })),
      );
    }
    if (region.admitted === 0) {
      console.warn(
        'ZERO admissible editables in the region. Either the region is the wrong ' +
          'container, or every candidate in it failed an invariant — the table above says which.',
      );
    } else if (region.admitted > 1) {
      console.warn(
        `${String(region.admitted)} admissible editables in one region. The uniqueness test ` +
          'refuses rather than guessing which one the send belongs to.',
      );
    }
  } else {
    console.warn(
      'The region uniqueness test NEVER RAN. For a button intent that means no ' +
        'region was found at all; for a key intent it is expected, because that ' +
        'path resolves from the composed path instead.',
    );
  }

  // THE WALK ITSELF. Promised by the previous round of instrumentation and not
  // actually printed, which is why "which outcome, and how many hops" could
  // not be answered from a trace that had everything else.
  const walk = lastComposerRegionWalk();
  if (walk !== null) {
    console.log(
      `region walk from <${walk.startedAt}>: ${walk.outcome} after ${String(walk.hops)} hop(s) ` +
        `(limit ${String(REGION_HOP_LIMIT_FOR_DISPLAY)})`,
    );
    console.table(
      walk.steps.map((step) => ({
        hop: step.hop,
        tag: step.tag,
        hasSendButton: step.hasSendButton,
        hasAdmissibleComposer: step.hasAdmissibleComposer,
      })),
    );
    const bothEver = walk.steps.some((s2) => s2.hasSendButton && s2.hasAdmissibleComposer);
    const buttonAt = walk.steps.find((s2) => s2.hasSendButton)?.hop;
    const composerAt = walk.steps.find((s2) => s2.hasAdmissibleComposer)?.hop;
    console.warn(
      bothEver
        ? 'Both conditions were true at one ancestor, so the region SHOULD have been found.'
        : `Never both true. Send button first seen at hop ${String(buttonAt ?? -1)}, ` +
          `admissible composer at hop ${String(composerAt ?? -1)} ` +
          `(-1 = never within the walk). If the composer number is -1 or larger than the ` +
          `limit, the bound is the constraint; if it is small and the button is -1, the ` +
          `send-button selector is.`,
    );
  }

  const submit = lastSubmitPath();
  if (submit.entries.length > 0) {
    const editables = submit.entries.filter((e) => e.editable).length;
    console.log(
      `composed path of the last key event: ${String(submit.entries.length)} node(s), ` +
        `${String(editables)} editable (${String(Date.now() - submit.atMs)}ms ago)`,
    );
    console.table(
      submit.entries.map((e: SubmitPathEntry, i: number) => ({
        depth: i,
        tag: e.tag,
        editable: e.editable,
        attributes: e.attributes.join(' '),
      })),
    );
  }
  console.groupEnd();
}
