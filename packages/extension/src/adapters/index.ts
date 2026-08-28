/**
 * Adapter registry.
 *
 * SPEC.md: "Implement adapters/chatgpt.ts, adapters/claude.ts,
 * adapters/gemini.ts."
 *
 * Only claude.ts exists so far, deliberately: the verification approach and
 * the interface are established against one real site before being copied
 * twice. `pickAdapter` returning null for chatgpt.com and gemini.google.com is
 * the correct behaviour today — the content script blocks rather than
 * pretending to protect a site it has no adapter for.
 */

import type { SiteAdapter } from './types.js';
import type { InputWitness } from './binding.js';
import { ClaudeAdapter } from './claude.js';

export type AdapterFactory = (doc: Document, witness: InputWitness) => SiteAdapter;

const FACTORIES: readonly AdapterFactory[] = [(doc, witness) => new ClaudeAdapter(doc, witness)];

/**
 * The adapter for a URL, or null if no adapter claims it.
 *
 * Returns null rather than a default adapter. There is no sensible default: an
 * adapter for the wrong site would resolve the wrong elements, which is the
 * failure mode this whole subsystem exists to prevent.
 */
export function pickAdapter(
  url: string,
  doc: Document,
  witness: InputWitness,
): SiteAdapter | null {
  for (const factory of FACTORIES) {
    const adapter = factory(doc, witness);
    if (adapter.matches(url)) return adapter;
  }
  return null;
}

export * from './types.js';
export { InputWitness, verifyBinding } from './binding.js';
export type { BindingVerdict, BindingFailureCode } from './binding.js';
export { resolveUnique, writeAndVerify, stillValid } from './resolve.js';
export { COMPOSER_INVARIANTS, RESPONSE_ROOT_INVARIANTS, isEditableSurface } from './invariants.js';
export { ClaudeAdapter, readEditableText, composerRegionOf } from './claude.js';
