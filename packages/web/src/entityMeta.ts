/**
 * entityMeta.ts — presentation metadata for entity types: the annotation
 * family each type belongs to (which drives its highlight colour) and a
 * short human label. Pure data; no detection logic lives in this package.
 */

// Families and labels both live in core: the extension's review panel and
// Local Insights name and group the same types, and two maps drift the moment
// a type is added to one of them.
export type { EntityFamily } from '@privacyshield/core';
export { familyOf, labelOf } from '@privacyshield/core';

/** Confidence tier name for a raw Stage 1 confidence value. */
export function confidenceTier(raw: number): 'maximum' | 'high' | 'medium' | 'low' {
  if (raw >= 0.99) return 'maximum';
  if (raw >= 0.85) return 'high';
  if (raw >= 0.6) return 'medium';
  return 'low';
}
