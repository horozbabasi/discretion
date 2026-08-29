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

/**
 * Detection did not complete.
 *
 * Reported so the badge can show that the page is NOT being checked. `detail`
 * is the error's name and message only - never its payload, because a
 * detection error can carry the candidate it failed on and a candidate carries
 * page text.
 */
export interface DetectionErrorMessage {
  readonly kind: 'detection-error';
  readonly detail: string;
}

export type ExtensionMessage = HealthMessage | UnsupportedSiteMessage | DetectionErrorMessage;
