/**
 * The content script <-> service worker message contract.
 *
 * Every field here is structural: kinds, targets, tiers, counts, timestamps.
 * No message carries page text, composer contents, or detected values, and
 * none ever will — SPEC's no-plaintext-persistence rule applies to messages
 * too, because a message crossing into the service worker is one careless
 * console.log away from being written somewhere durable.
 */

import type { ResolutionFailureKind, StrategyTier } from './adapters/index.js';

export interface HealthMessage {
  readonly kind: 'health';
  readonly ok: boolean;
  readonly failures: readonly { readonly kind: ResolutionFailureKind; readonly target: string }[];
  readonly warnings: readonly { readonly target: string; readonly tier: StrategyTier }[];
  readonly checkedAt: number;
}

export interface UnsupportedSiteMessage {
  readonly kind: 'unsupported-site';
}

export type ExtensionMessage = HealthMessage | UnsupportedSiteMessage;
