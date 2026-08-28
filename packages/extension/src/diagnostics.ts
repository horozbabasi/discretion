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
import {
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

export interface AdapterDiagnostic {
  readonly site: string;
  readonly displayName: string;
  /** Path with id-shaped segments masked, so no conversation id is emitted. */
  readonly path: string;
  readonly composer: ElementDiagnostic;
  readonly responseRoot: ElementDiagnostic;
  readonly health: HealthReport;
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
  };
}
