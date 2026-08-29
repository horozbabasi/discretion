/**
 * Stage 2b — gazetteer corroboration, attached to the spans it corroborates.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS, WHICH IS A CORRECTION RATHER THAN A NEW FEATURE
 *
 * SPEC.md places the gazetteers in STAGE 2: "Bundled compressed lookup sets,
 * checked in parallel with the model." The lookup had drifted into Stage 3's
 * scorer, where it ran as one context signal among many.
 *
 * That placement was invisible until the extension was built, and then it was
 * expensive in a way nothing else made visible. Stage 3 runs in the CONTENT
 * SCRIPT. Its scorer statically imported the gazetteer module, so 3.4 MB of
 * base64 Bloom filters were linked into a bundle that is parsed on every page
 * load of all three sites — to serve PERSON, ORG and LOCATION candidates,
 * which only Stage 2 produces, and which cannot exist at all in a build with
 * no model attached.
 *
 * Moving the lookup here is not a size optimisation. It restores the stage
 * boundary SPEC drew, and the size follows from that: the gazetteers now live
 * on the same side of the process boundary as the model, because they answer
 * questions only the model can ask.
 *
 * BEHAVIOUR IS UNCHANGED, and that is checkable rather than asserted: no
 * Stage 1 detector declares PERSON, ORG or LOCATION (31 types, verified by
 * enumeration), so no Stage 1 candidate could ever have reached the lookup in
 * Stage 3. The contribution Stage 3 emits is byte-identical; it is now built
 * from a hit computed here instead of one computed there.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { lookupGazetteer } from '../gazetteer/index.js';
import type { GazetteerType } from '../gazetteer/index.js';
import type { NerEntityType, NerSpan } from './types.js';

/**
 * The model's label set and the gazetteer's are the same three types.
 *
 * Asserted at COMPILE time rather than guarded at run time. The obvious
 * implementation calls `isGazetteerType(span.type)` before each lookup - but
 * `NerSpan.type` is already exactly those three, so that branch can never be
 * false. A check that cannot fail reads as a safety property and is not one;
 * this fails the BUILD if either union ever gains a member the other lacks,
 * which is the moment the guard would have started mattering.
 */
type MissingFromGazetteer = Exclude<NerEntityType, GazetteerType>;
type MissingFromNer = Exclude<GazetteerType, NerEntityType>;
// Both must be `never`. A non-never member here is a type the other side does
// not know about, and it fails the build at exactly the point where the
// removed runtime guard would have started doing work.
export type Stage2bTypesAgree = [MissingFromGazetteer, MissingFromNer] extends [never, never]
  ? true
  : never;
const _typesAgree: Stage2bTypesAgree = true;
void _typesAgree;

/**
 * Attach gazetteer corroboration to each span.
 *
 * A miss attaches nothing rather than attaching an absent hit: "not in the
 * gazetteer" is not evidence against a name — the sets are large but nowhere
 * near complete — and a field distinguishing "looked and found nothing" from
 * "did not look" would invite a caller to treat the first as a negative
 * signal. `useGazetteers: false` and a genuine miss are meant to be
 * indistinguishable downstream, because they justify the same conclusion:
 * nothing was corroborated.
 */
export function attachGazetteerHits(spans: readonly NerSpan[]): NerSpan[] {
  return spans.map((span) => {
    const hit = lookupGazetteer(span.text, span.type);
    return hit === undefined ? span : { ...span, gazetteer: hit };
  });
}
