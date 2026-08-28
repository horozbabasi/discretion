/**
 * A structural probe of a LIVE site, using the real adapter code.
 *
 * Fixtures verify that the adapter's logic is correct on page shapes we know
 * about (Claim A in ADAPTER-VERIFICATION.md). Only the live site can tell you
 * whether it still HAS those shapes (Claim B). This module is how Claim B gets
 * checked, and it deliberately runs the production strategies and invariants
 * rather than a reimplementation — a probe that reimplemented them could agree
 * with itself while the adapter was broken.
 *
 * NOT part of the shipped extension. `scripts/build-live-probe.mjs` bundles it
 * separately into a gitignored directory, and `scripts/verify-live.py` injects
 * it as an init script so the input witness is installed before the page's own
 * scripts run — a witness created at probe time would have missed the typing
 * it is supposed to have observed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT REPORTS STRUCTURE, NEVER CONTENT.
 *
 * The probe runs against a signed-in session on somebody's real account. Its
 * output is read by a developer, pasted into issues, and quoted in commit
 * messages. So it reports tag names, counts, tiers, strategy ids and text
 * LENGTHS — never the composer's text, never a message, never a conversation
 * id. Attribute values are emitted only when they pass the same conservative
 * test the fixture scrubber uses, because a site can interpolate user content
 * into an aria-label.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { COMPOSER_INVARIANTS, RESPONSE_ROOT_INVARIANTS } from '../adapters/invariants.js';
import { CLAUDE_COMPOSER_STRATEGIES, CLAUDE_RESPONSE_STRATEGIES } from '../adapters/claude.js';
import { CHATGPT_COMPOSER_STRATEGIES, CHATGPT_RESPONSE_STRATEGIES } from '../adapters/chatgpt.js';
import { GEMINI_COMPOSER_STRATEGIES, GEMINI_RESPONSE_STRATEGIES } from '../adapters/gemini.js';
import { InputWitness, pickAdapter } from '../adapters/index.js';
import type { ElementStrategy, Invariant, SiteAdapter } from '../adapters/types.js';

/**
 * The strategy lists to observe for each site.
 *
 * Keyed by adapter id so the probe reports on the SAME lists the adapter used,
 * rather than a copy that could drift out of step with it.
 */
const STRATEGIES_BY_SITE: Readonly<
  Record<string, { composer: readonly ElementStrategy<Element>[]; response: readonly ElementStrategy[] }>
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

export interface StrategyObservation {
  readonly id: string;
  readonly tier: string;
  readonly matched: number;
  readonly nodes: readonly {
    readonly tag: string;
    readonly editable: boolean;
    readonly textLength: number;
    readonly failsInvariants: readonly string[];
    readonly ariaLabel: string | null;
  }[];
}

export interface LiveProbeReport {
  readonly site: string;
  readonly path: string;
  readonly adapterMatched: boolean;
  readonly composer: {
    readonly resolved: boolean;
    readonly tier: string | null;
    readonly strategyId: string | null;
    readonly failureKind: string | null;
    readonly failureDetail: string | null;
    readonly textLength: number | null;
  };
  readonly responseRoot: { readonly resolved: boolean; readonly failureKind: string | null };
  readonly sendButtons: number;
  readonly health: {
    readonly ok: boolean;
    readonly failures: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly strategies: readonly StrategyObservation[];
  /**
   * Whether the composer the adapter resolved is the one the witness saw
   * input on. null when the composer is empty, i.e. nobody has typed yet.
   */
  readonly witnessWorks: boolean | null;
  /** Whether a round-trip read of the composer preserved its length. */
  readonly readBackLength: number | null;
}

/** Same conservative test the fixture scrubber uses. */
function safeAttributeValue(value: string | null): string | null {
  if (value === null) return null;
  if (value.length > 60 || /[@]/u.test(value) || /\d{4,}/u.test(value)) return '<withheld>';
  return value;
}

function observe(
  strategies: readonly ElementStrategy<Element>[],
  invariants: readonly Invariant<Element>[],
): StrategyObservation[] {
  return strategies.map((strategy) => {
    let matched: readonly Element[] = [];
    try {
      matched = strategy.find(document);
    } catch {
      matched = [];
    }
    return {
      id: strategy.id,
      tier: strategy.tier,
      matched: matched.length,
      nodes: matched.slice(0, 5).map((node) => ({
        tag: node.tagName.toLowerCase(),
        editable: node instanceof HTMLElement && node.isContentEditable,
        textLength: (node.textContent ?? '').length,
        failsInvariants: invariants.filter((inv) => !inv.holds(node)).map((inv) => inv.id),
        ariaLabel: safeAttributeValue(node.getAttribute('aria-label')),
      })),
    };
  });
}

function buildReport(adapter: SiteAdapter, witness: InputWitness): LiveProbeReport {
  const lists = STRATEGIES_BY_SITE[adapter.id] ?? { composer: [], response: [] };
  const composer = adapter.getComposer();
  const responseRoot = adapter.getResponseRoot();
  const health = adapter.healthCheck();

  let witnessWorks: boolean | null = null;
  let textLength: number | null = null;
  let readBackLength: number | null = null;
  if (composer.ok) {
    const text = adapter.getComposerText(composer.value);
    textLength = text.length;
    readBackLength = adapter.getComposerText(composer.value).length;
    // Only meaningful once the operator has typed something. The probe never
    // types on the user's behalf: that would put characters into a real
    // conversation on a real account.
    witnessWorks = text.length > 0 ? witness.hasTyped(composer.value.node) : null;
  }

  return {
    site: adapter.id,
    // Path with any id-shaped segment masked, so a conversation id never
    // reaches the report.
    path: location.pathname.replace(/[0-9a-f-]{16,}/giu, '<id>'),
    adapterMatched: adapter.matches(location.href),
    composer: {
      resolved: composer.ok,
      tier: composer.ok ? composer.value.tier : null,
      strategyId: composer.ok ? composer.value.strategyId : null,
      failureKind: composer.ok ? null : composer.failure.kind,
      failureDetail: composer.ok ? null : composer.failure.detail,
      textLength,
    },
    responseRoot: {
      resolved: responseRoot.ok,
      failureKind: responseRoot.ok ? null : responseRoot.failure.kind,
    },
    // Coarse, site-agnostic count. The authoritative answer is health.failures,
    // which each adapter computes with its own send-control rules.
    sendButtons: document.querySelectorAll(
      'button[data-testid="send-button"], button[data-test-id="send-button"], button.send-button, button[type="submit"]',
    ).length,
    health: {
      ok: health.ok,
      failures: health.failures.map((f) => `${f.target}:${f.kind}`),
      warnings: health.warnings.map((w) => `${w.target}:${w.tier}`),
    },
    strategies: [
      ...observe(lists.composer, COMPOSER_INVARIANTS as readonly Invariant<Element>[]),
      ...observe(lists.response, RESPONSE_ROOT_INVARIANTS),
    ],
    witnessWorks,
    readBackLength,
  };
}

// Installed at document-start so the witness observes everything the operator
// types, and so `location` changes in an SPA do not need a re-injection.
const sharedWitness = new InputWitness(document);
sharedWitness.start();

declare global {
  var __PS_PROBE__: (() => LiveProbeReport | null) | undefined;
}

globalThis.__PS_PROBE__ = (): LiveProbeReport | null => {
  // Uses the real registry, so the probe cannot verify a site the product
  // would not have recognised.
  const adapter = pickAdapter(location.href, document, sharedWitness);
  return adapter === null ? null : buildReport(adapter, sharedWitness);
};
