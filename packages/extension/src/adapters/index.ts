/**
 * Adapter registry.
 *
 * SPEC.md: "Implement adapters/chatgpt.ts, adapters/claude.ts,
 * adapters/gemini.ts."
 *
 * claude.ts was written first and alone, so that the shape the other two copy
 * is one that had been through a real site rather than designed in the
 * abstract. All three exist now.
 *
 * `pickAdapter` returns null rather than a default for anything else. There is
 * no sensible default: an adapter for the wrong site would resolve the wrong
 * elements, which is the failure this whole subsystem exists to prevent.
 */

import type { SiteAdapter } from './types.js';
import type { InputWitness } from './binding.js';
import { ClaudeAdapter } from './claude.js';
import { ChatGptAdapter } from './chatgpt.js';
import { GeminiAdapter } from './gemini.js';

export type AdapterFactory = (doc: Document, witness: InputWitness) => SiteAdapter;

const FACTORIES: readonly AdapterFactory[] = [
  (doc, witness) => new ClaudeAdapter(doc, witness),
  (doc, witness) => new ChatGptAdapter(doc, witness),
  (doc, witness) => new GeminiAdapter(doc, witness),
];

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
export { ClaudeAdapter, readEditableText } from './claude.js';
export { ChatGptAdapter, CHATGPT_COMPOSER_STRATEGIES, CHATGPT_RESPONSE_STRATEGIES } from './chatgpt.js';
export { GeminiAdapter, GEMINI_COMPOSER_STRATEGIES, GEMINI_RESPONSE_STRATEGIES } from './gemini.js';
export { CLAUDE_COMPOSER_STRATEGIES, CLAUDE_RESPONSE_STRATEGIES } from './claude.js';
export { writeEditableText } from './text.js';
export { deepQueryAll, closestAcrossShadow } from './deep.js';
