/**
 * Discriminating the SEND control from the other controls beside a composer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The composer-anchored search finds the controls in the composer's region and
 * refuses when there is more than one — correctly, because binding the wrong
 * control means a send that is never intercepted, which is unmasked text
 * leaving the machine. But a real composer toolbar holds a send control AND a
 * microphone AND an attachment button, so "more than one" is the normal case,
 * and refusing every time makes the fallback useless.
 *
 * What is needed is not a wider search. It is a way to say which of them IS
 * the send control.
 *
 * EVERY RULE HERE IS A POSITIVE PROPERTY OF SENDING. None of them works by
 * excluding the microphone, and that constraint is doing real work: "not the
 * mic" requires knowing every other control a toolbar might ever hold, and
 * silently binds whatever appears next to be added. "Submits the form the
 * composer is in" does not degrade that way.
 *
 * REFUSAL REMAINS THE DEFAULT. If no rule identifies exactly one control, the
 * result is still ambiguity and the adapter still fails loudly. A
 * discriminator that guesses is worse than none, because it converts a visible
 * failure into a wrong binding.
 *
 * SHARED, NOT GEMINI-SPECIFIC. Only Gemini has a composer-anchored path today,
 * so only Gemini can reach this ambiguity — but Claude and ChatGPT both resolve
 * their send controls by markers ALONE, which means they have no fallback at
 * all if those markers rot, and both sites have attach/microphone controls
 * beside the composer. The day either gains a composer-anchored path it meets
 * the identical two-control region, so the answer lives here rather than in one
 * adapter.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Which rule identified the control. Reported, so a weak rule is visible. */
export type DiscriminatorRule = 'form-submit' | 'aria-controls' | 'send-icon';

export interface DiscriminatorOutcome {
  readonly control: HTMLElement | null;
  readonly rule: DiscriminatorRule | null;
  /** Every rule tried, and how many candidates each identified. */
  readonly attempts: readonly { readonly rule: DiscriminatorRule; readonly matched: number }[];
}

/**
 * RULE 1 — the control natively submits the form the composer is in.
 *
 * The strongest available property, and the most durable: it is a platform
 * relationship rather than a naming convention, so it survives every rename,
 * restyle and class-hash change. `HTMLButtonElement.form` is set by the
 * browser from either containment or the `form` attribute, so it also works
 * when the control sits outside the form element in the DOM.
 *
 * A `<button>` inside a form defaults to `type="submit"`, which is why the
 * absence of an explicit type counts.
 */
function byFormSubmission(candidates: readonly HTMLElement[], composer: Element): HTMLElement[] {
  return candidates.filter((control) => {
    if (!(control instanceof HTMLButtonElement) && !(control instanceof HTMLInputElement)) {
      return false;
    }
    const form = control.form;
    if (form === null || !form.contains(composer)) return false;
    const explicitType = control.getAttribute('type');
    return explicitType === null || explicitType.toLowerCase() === 'submit';
  });
}

/**
 * RULE 2 — the control declares an ARIA relationship to the composer.
 *
 * `aria-controls` on a send button naming the composer is an explicit
 * statement that this control acts on that element. Rare, but when present it
 * is unambiguous and locale-independent, and it is the relationship assistive
 * technology already relies on.
 */
function byAriaRelationship(candidates: readonly HTMLElement[], composer: Element): HTMLElement[] {
  const composerId = composer.getAttribute('id');
  if (composerId === null || composerId.length === 0) return [];
  return candidates.filter((control) => {
    const controls = control.getAttribute('aria-controls');
    if (controls === null) return false;
    return controls.split(/\s+/u).includes(composerId);
  });
}

/**
 * RULE 3 — the control carries a send icon.
 *
 * A positive identity claim: this control is decorated as the send action.
 * Weaker than the two above because an icon name is a convention rather than a
 * platform relationship, and the ligature form lives in a text node that
 * page-level machine translation can rewrite.
 *
 * The predicate is injected rather than defined here: each site names its
 * icons differently, and a copy of the site's rule living in shared code is
 * the drift that has already caused defects in this codebase.
 */
function bySendIcon(
  candidates: readonly HTMLElement[],
  hasSendIcon: (control: Element) => boolean,
): HTMLElement[] {
  return candidates.filter(hasSendIcon);
}

/**
 * Identifies the send control among several, or refuses.
 *
 * Rules are applied in the contract's own order of durability: a platform
 * relationship, then a declared accessible relationship, then markup
 * convention. The first rule that identifies EXACTLY ONE candidate wins; a
 * rule matching several or none is passed over rather than tie-broken.
 */
export function discriminateSendControl(
  candidates: readonly HTMLElement[],
  composer: Element,
  hasSendIcon: (control: Element) => boolean,
): DiscriminatorOutcome {
  const rules: { rule: DiscriminatorRule; run: () => HTMLElement[] }[] = [
    { rule: 'form-submit', run: () => byFormSubmission(candidates, composer) },
    { rule: 'aria-controls', run: () => byAriaRelationship(candidates, composer) },
    { rule: 'send-icon', run: () => bySendIcon(candidates, hasSendIcon) },
  ];

  const attempts: { rule: DiscriminatorRule; matched: number }[] = [];
  for (const { rule, run } of rules) {
    const matched = run();
    attempts.push({ rule, matched: matched.length });
    // Exactly one, or move on. Two candidates satisfying the same rule is the
    // same problem one level down, and choosing between them would reintroduce
    // precisely the tie-break the ambiguity rule forbids.
    if (matched.length === 1) {
      return { control: matched[0] as HTMLElement, rule, attempts };
    }
  }
  return { control: null, rule: null, attempts };
}
