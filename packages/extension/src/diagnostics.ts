/**
 * A structural diagnostic of what an adapter resolved, and why.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS SHIPS RATHER THAN BEING A DEV SCRIPT
 *
 * SPEC's strongest sentence is that silent failure must be impossible by
 * construction. Measured (`scripts/verify-injection.py`), the extension was
 * silent by construction in a way nobody intended: the content script injected
 * correctly, resolved the composer correctly, degraded correctly on a broken
 * page — and emitted NOTHING observable. The only signal was a badge, and on a
 * healthy page the badge is empty, which is indistinguishable from the
 * extension not running at all.
 *
 * So nobody could answer "did the adapter find the composer, and by which
 * strategy" without attaching a debugger to the service worker. That makes
 * SPEC's requirement unverifiable, and an unverifiable requirement is not a
 * requirement.
 *
 * This module is what makes it checkable. It is deliberately part of the
 * shipped code rather than a development-only script, for one reason: the
 * sites change, and when a user reports "it stopped working on Gemini", the
 * only useful thing they can send back is this report from their own browser.
 * A diagnostic that only exists on a developer's machine is no help on the day
 * it is needed.
 *
 * NEVER INCLUDES PAGE TEXT. Lengths, counts, tags, tiers and strategy ids
 * only. This output is designed to be pasted into a bug report by a user who
 * has no way to audit it first, so it must be safe by construction rather than
 * by their judgement.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ElementStrategy, HealthReport, Invariant, SiteAdapter } from './adapters/index.js';
import { deepQueryAll } from './adapters/deep.js';
import {
  isEditableSurface,
  CHATGPT_COMPOSER_STRATEGIES,
  CHATGPT_RESPONSE_STRATEGIES,
  CLAUDE_COMPOSER_STRATEGIES,
  CLAUDE_RESPONSE_STRATEGIES,
  COMPOSER_INVARIANTS,
  GEMINI_COMPOSER_STRATEGIES,
  GEMINI_RESPONSE_STRATEGIES,
  RESPONSE_ROOT_INVARIANTS,
} from './adapters/index.js';

/** What one strategy saw, and why its matches were or were not admitted. */
export interface StrategyDiagnostic {
  readonly id: string;
  readonly tier: string;
  /** How many nodes the selector matched. */
  readonly matched: number;
  /** How many of those satisfied every invariant — the ambiguity count. */
  readonly admitted: number;
  /** Invariants that rejected a match, with how many each rejected. */
  readonly rejectedBy: Readonly<Record<string, number>>;
}

export interface ElementDiagnostic {
  readonly target: string;
  readonly resolved: boolean;
  readonly tier: string | null;
  readonly strategyId: string | null;
  readonly failureKind: string | null;
  readonly failureDetail: string | null;
  /** Candidates admitted at the tier that decided the outcome. */
  readonly ambiguityCount: number;
  readonly strategies: readonly StrategyDiagnostic[];
}

/**
 * Forensics for the case where nothing resolved.
 *
 * When every strategy returns zero, the failure could be a closed shadow root,
 * an iframe the content script cannot enter, or five genuinely stale
 * selectors — and those need completely different fixes. The per-strategy
 * table cannot tell them apart, because "matched 0" looks identical in all
 * three. This is what distinguishes them, and it is emitted ONLY on failure so
 * a healthy page stays quiet.
 *
 * Counts and tag names only. Never text.
 */
/** One editable surface found anywhere, described structurally. */
export interface EditableCandidate {
  readonly tag: string;
  readonly type: string | null;
  readonly visible: boolean;
  readonly editable: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly textLength: number;
  /** Attribute NAMES present, never their values. */
  readonly attributes: readonly string[];
  /** Ancestor tag chain, nearest first, bounded. */
  readonly ancestors: readonly string[];
  /** Composer invariants this candidate fails, if any. */
  readonly failsInvariants: readonly string[];
}

export interface EnvironmentForensics {
  /**
   * WHEN this reading was taken. Recorded because the first version of these
   * forensics had no timing information and was emitted once, at
   * document_idle - which for a single-page app is BEFORE the app paints. A
   * "matched 0" reading from an unpainted shell is indistinguishable from a
   * stale selector, and there was no way to tell which you were looking at.
   */
  readonly readyState: string;
  readonly msSinceScriptStart: number;
  readonly attempt: number;
  /**
   * Total elements in the document. The cheapest paint signal there is: an
   * unbootstrapped SPA shell has hundreds, a painted application has
   * thousands. If this is small, every other count here means nothing.
   */
  readonly domElementCount: number;
  /** Open shadow roots reachable from the document, and the deepest nesting. */
  readonly openShadowRoots: number;
  readonly maxShadowDepth: number;
  /**
   * Custom elements that render but expose no children and no shadowRoot.
   * The strongest available signal for a CLOSED shadow root: something is
   * painting, and it is not reachable. `shadowRoot` is null for closed roots
   * and there is no supported way in, so this heuristic is the only answer
   * available from a content script.
   */
  readonly likelyClosedShadowHosts: readonly string[];
  /** Frames the content script cannot see into (manifest sets all_frames:false). */
  readonly iframes: number;
  /**
   * Generic probes, from most to least specific. Whether a bare `textarea` or
   * `[contenteditable]` exists anywhere separates "the composer moved" from
   * "the composer is unreachable".
   */
  readonly probes: Readonly<Record<string, { light: number; deep: number }>>;
  /** Custom element tag names present, which is how an Angular app is shaped. */
  readonly customElements: readonly string[];
  /** Every editable surface found, described structurally. Never text. */
  readonly editableCandidates: readonly EditableCandidate[];
}

export interface AdapterDiagnostic {
  readonly site: string;
  readonly displayName: string;
  /** Path with id-shaped segments masked, so no conversation id is emitted. */
  readonly path: string;
  readonly composer: ElementDiagnostic;
  readonly responseRoot: ElementDiagnostic;
  readonly health: HealthReport;
  /** Present only when something failed to resolve. */
  readonly forensics: EnvironmentForensics | null;
}

const STRATEGIES_BY_SITE: Readonly<
  Record<
    string,
    { composer: readonly ElementStrategy<Element>[]; response: readonly ElementStrategy[] }
  >
> = {
  claude: {
    composer: CLAUDE_COMPOSER_STRATEGIES as readonly ElementStrategy<Element>[],
    response: CLAUDE_RESPONSE_STRATEGIES,
  },
  chatgpt: {
    composer: CHATGPT_COMPOSER_STRATEGIES as readonly ElementStrategy<Element>[],
    response: CHATGPT_RESPONSE_STRATEGIES,
  },
  gemini: {
    composer: GEMINI_COMPOSER_STRATEGIES as readonly ElementStrategy<Element>[],
    response: GEMINI_RESPONSE_STRATEGIES,
  },
};

function describeStrategies(
  strategies: readonly ElementStrategy<Element>[],
  invariants: readonly Invariant<Element>[],
  root: ParentNode,
): { diagnostics: StrategyDiagnostic[]; admittedAtDecidingTier: number } {
  const diagnostics: StrategyDiagnostic[] = [];
  let admittedAtDecidingTier = 0;
  let decided = false;

  for (const strategy of strategies) {
    let matched: readonly Element[] = [];
    try {
      matched = strategy.find(root);
    } catch {
      matched = [];
    }
    const rejectedBy: Record<string, number> = {};
    let admitted = 0;
    for (const node of matched) {
      const broken = invariants.filter((inv) => !inv.holds(node));
      if (broken.length === 0) {
        admitted += 1;
        continue;
      }
      for (const inv of broken) rejectedBy[inv.id] = (rejectedBy[inv.id] ?? 0) + 1;
    }
    diagnostics.push({ id: strategy.id, tier: strategy.tier, matched: matched.length, admitted, rejectedBy });
    // The first tier to admit anything is the one that decides the outcome.
    if (!decided && admitted > 0) {
      admittedAtDecidingTier = admitted;
      decided = true;
    }
  }
  return { diagnostics, admittedAtDecidingTier };
}

/** Probe selectors, ordered from what the adapter expects to the most generic. */
const PROBE_SELECTORS = [
  'rich-textarea',
  'div.ql-editor',
  '[contenteditable][role="textbox"]',
  '[role="textbox"]',
  '[contenteditable]',
  'textarea',
  'input[type="text"]',
  // Controls. `button` alone is not enough: an app can build controls from
  // div[role=button], and "0 buttons on a page with a visible send control"
  // needs to distinguish that from a page that has not painted.
  'button',
  '[role="button"]',
  'mat-icon',
  'main, [role="main"]',
] as const;

function collectShadowStats(doc: Document): {
  roots: number;
  maxDepth: number;
  likelyClosed: string[];
  customElements: string[];
} {
  let roots = 0;
  let maxDepth = 0;
  const likelyClosed = new Set<string>();
  const customElements = new Set<string>();

  const visit = (node: ParentNode, depth: number): void => {
    if (depth > 12) return;
    maxDepth = Math.max(maxDepth, depth);
    for (const element of Array.from(node.querySelectorAll('*'))) {
      const tag = element.tagName.toLowerCase();
      if (tag.includes('-')) customElements.add(tag);
      const shadow = element.shadowRoot;
      if (shadow !== null) {
        roots += 1;
        visit(shadow, depth + 1);
        continue;
      }
      // Renders, has no children of its own, and exposes no shadow root:
      // something is painting from a tree we cannot reach.
      if (tag.includes('-') && element.children.length === 0) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) likelyClosed.add(tag);
      }
    }
  };
  visit(doc, 0);

  return {
    roots,
    maxDepth,
    likelyClosed: [...likelyClosed].sort(),
    customElements: [...customElements].sort().slice(0, 40),
  };
}

/** Attribute names only - values can contain user content. */
function attributeNames(element: Element): string[] {
  return Array.from(element.attributes)
    .map((a) => a.name)
    .sort()
    .slice(0, 24);
}

function ancestorChain(element: Element): string[] {
  const chain: string[] = [];
  let node: Element | null = element.parentElement;
  let hops = 0;
  while (node !== null && hops < 8) {
    chain.push(node.tagName.toLowerCase());
    node = node.parentElement;
    hops += 1;
  }
  return chain;
}

/**
 * Describes every editable surface on the page.
 *
 * This is what answers "is that lone textarea actually the composer, or a
 * hidden form field?" - a hidden field and a real composer both count as 1.
 */
function collectEditableCandidates(doc: Document): EditableCandidate[] {
  const found = deepQueryAll<HTMLElement>(doc, 'textarea, input, [contenteditable]');
  return found.slice(0, 12).map((element) => {
    const rect = element.getBoundingClientRect();
    const asInput = element as HTMLInputElement & HTMLTextAreaElement;
    return {
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type'),
      visible: rect.width > 0 && rect.height > 0,
      editable: isEditableSurface(element),
      disabled: asInput.disabled === true,
      readOnly: asInput.readOnly === true,
      textLength: (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
        ? element.value
        : (element.textContent ?? '')
      ).length,
      attributes: attributeNames(element),
      ancestors: ancestorChain(element),
      failsInvariants: (COMPOSER_INVARIANTS as readonly Invariant<Element>[])
        .filter((inv) => !inv.holds(element))
        .map((inv) => inv.id),
    };
  });
}

let scriptStart = 0;
let attemptCounter = 0;

/** Called once when the content script starts, so timings are meaningful. */
export function markScriptStart(): void {
  scriptStart = Date.now();
}

function buildForensics(doc: Document): EnvironmentForensics {
  const shadow = collectShadowStats(doc);
  const probes: Record<string, { light: number; deep: number }> = {};
  for (const selector of PROBE_SELECTORS) {
    let light = 0;
    let deep = 0;
    try {
      light = doc.querySelectorAll(selector).length;
      deep = deepQueryAll(doc, selector).length;
    } catch {
      light = -1;
      deep = -1;
    }
    probes[selector] = { light, deep };
  }
  attemptCounter += 1;
  return {
    readyState: doc.readyState,
    msSinceScriptStart: scriptStart === 0 ? -1 : Date.now() - scriptStart,
    attempt: attemptCounter,
    domElementCount: doc.querySelectorAll('*').length,
    openShadowRoots: shadow.roots,
    maxShadowDepth: shadow.maxDepth,
    likelyClosedShadowHosts: shadow.likelyClosed,
    iframes: doc.querySelectorAll('iframe').length,
    probes,
    customElements: shadow.customElements,
    editableCandidates: collectEditableCandidates(doc),
  };
}

export function buildDiagnostic(adapter: SiteAdapter, doc: Document): AdapterDiagnostic {
  const lists = STRATEGIES_BY_SITE[adapter.id] ?? { composer: [], response: [] };

  const composerResolution = adapter.getComposer();
  const composerStrategies = describeStrategies(
    lists.composer,
    COMPOSER_INVARIANTS as readonly Invariant<Element>[],
    doc,
  );
  const responseResolution = adapter.getResponseRoot();
  const responseStrategies = describeStrategies(lists.response, RESPONSE_ROOT_INVARIANTS, doc);

  return {
    site: adapter.id,
    displayName: adapter.displayName,
    path: doc.location.pathname.replace(/[0-9a-f-]{12,}/giu, '<id>'),
    composer: {
      target: 'composer',
      resolved: composerResolution.ok,
      tier: composerResolution.ok ? composerResolution.value.tier : null,
      strategyId: composerResolution.ok ? composerResolution.value.strategyId : null,
      failureKind: composerResolution.ok ? null : composerResolution.failure.kind,
      failureDetail: composerResolution.ok ? null : composerResolution.failure.detail,
      ambiguityCount: composerStrategies.admittedAtDecidingTier,
      strategies: composerStrategies.diagnostics,
    },
    responseRoot: {
      target: 'response-root',
      resolved: responseResolution.ok,
      tier: responseResolution.ok ? responseResolution.value.tier : null,
      strategyId: responseResolution.ok ? responseResolution.value.strategyId : null,
      failureKind: responseResolution.ok ? null : responseResolution.failure.kind,
      failureDetail: responseResolution.ok ? null : responseResolution.failure.detail,
      ambiguityCount: responseStrategies.admittedAtDecidingTier,
      strategies: responseStrategies.diagnostics,
    },
    health: adapter.healthCheck(),
    forensics:
      composerResolution.ok && responseResolution.ok ? null : buildForensics(doc),
  };
}
