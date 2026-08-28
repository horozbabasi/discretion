/**
 * Adapter for gemini.google.com.
 *
 * Built against the contract proven by claude.ts. Read `types.ts`'s header
 * first.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS DIFFERENT ABOUT THIS SITE
 *
 * 1. SHADOW DOM. Gemini is an Angular application built from custom elements,
 *    and the composer has lived inside a `<rich-textarea>` that may attach a
 *    shadow root. `document.querySelectorAll` does not descend into shadow
 *    roots, so a document-wide query can return NOTHING while the composer is
 *    plainly on screen — reported as 'not-found', blocking a healthy page.
 *    Every strategy here uses `deepQueryAll`, and `closestAcrossShadow` is
 *    used for the region walk so a send button inside a shadow root can still
 *    find its composer.
 *
 *    CLOSED shadow roots stay unreachable, deliberately. There is no supported
 *    way in, so the adapter reports 'not-found' and blocks. Loud is correct;
 *    what must never happen is silently resolving some other element because
 *    the real one was invisible to the query.
 *
 * 2. QUILL OWNS THE DOM. Like ProseMirror, it reconciles the DOM against an
 *    internal model, and the model is what gets submitted. The shared
 *    execCommand-based write in text.ts is what it accepts; a textContent
 *    assignment would be reverted, which writeAndVerify would then catch.
 *
 * 3. THE SEND BUTTON IS AN ICON. Gemini's send control has carried no stable
 *    test id in some builds, and its accessible name is localised. The
 *    locale-independent markers come first; an English aria-label match exists
 *    only as a last resort, at the weakest tier, with its limitation stated —
 *    because a send control that only matches in English is a send control
 *    that silently fails for most of the world.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  ComposerHandle,
  ElementHandle,
  ElementStrategy,
  HealthReport,
  HealthWarning,
  Resolution,
  ResolutionFailure,
  ResponseStreamEvent,
  SiteAdapter,
  SubmitIntent,
  WriteResult,
} from './types.js';
import { COMPOSER_INVARIANTS, RESPONSE_ROOT_INVARIANTS, isEditableSurface } from './invariants.js';
import { resolveUnique, writeAndVerify } from './resolve.js';
import { readEditableText, writeEditableText } from './text.js';
import { closestAcrossShadow, deepQueryAll, parentAcrossShadow } from './deep.js';
import type { InputWitness } from './binding.js';
import { originComposerOfButtonEvent, originComposerOfKeyEvent } from './binding.js';
import { collectChangedTextNodes } from './stream.js';
import { discriminateSendControl } from './sendControl.js';
import type { DiscriminatorOutcome } from './sendControl.js';

/**
 * Conversation id.
 *
 * The optional `/u/<n>` prefix is Google's multi-account routing, which the
 * other two sites have no equivalent of. Without it, every conversation in any
 * account but the first would report a null id.
 */
const CONVERSATION_PATH = /^(?:\/u\/\d+)?\/app\/((?:c_)?[0-9a-fA-F]{12,})\/?$/u;

const EDITABLE_SELECTOR = 'textarea, input, [contenteditable]';

/**
 * What counts as a CONTROL, regardless of tag.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE TAG ASSUMPTION, REMOVED.
 *
 * Every send-control clause previously began with the literal `button` tag.
 * That single assumption was shared by every clause at every tier, so the
 * tiered ladder was an illusion for this element: attribute and class tiers
 * varied while the TAG stayed constant, and one markup change defeated all of
 * them at once.
 *
 * An accessible control is any element carrying `role="button"` — what
 * assistive technology reads — so it is at least as durable as a test id.
 * Requiring `<button>` on top was a narrowing nobody chose.
 *
 * A NOTE ON THE COMMENT THIS REPLACES. It claimed "a wider net that catches
 * two candidates fails hard rather than guessing". That is true of
 * `resolveUnique`, which governs the COMPOSER — and it was false of
 * `findSendButtons`, which returned every candidate it found. The comment
 * asserted a property the code did not have, which is the same defect as a
 * summary asserting an untested conclusion. The ambiguity rule is now
 * actually implemented below, and the claim is true.
 * ─────────────────────────────────────────────────────────────────────────
 */
const CONTROL_SELECTOR = 'button, [role="button"], input[type="submit"]';

/** Locale-independent send markers, strongest first. Tag-agnostic. */
const SEND_MARKER_SELECTOR = [
  '[data-test-id="send-button"]',
  '[data-testid="send-button"]',
  '.send-button',
].join(', ');

/** Material icons carrying the send name as an attribute. */
const SEND_ICON_ATTRIBUTE_SELECTOR =
  'mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send"]';

/**
 * How the send control was found. Everything below `marker` is weaker than a
 * declared test id, and `healthCheck` warns for each — because a control found
 * by the guessiest path reporting identically to one found by a test id is how
 * a weak result gets trusted.
 */
export type SendProvenance =
  | 'marker'
  | 'icon-attribute'
  | 'icon-ligature'
  | 'near-composer'
  | 'english-label';

export interface SendControlResult {
  readonly buttons: readonly HTMLElement[];
  readonly provenance: SendProvenance | null;
  /** Two or more distinct candidates at one tier: refuse, do not choose. */
  readonly ambiguous: boolean;
}

/**
 * Normalises a Material ligature name before comparison.
 *
 * `trim()` removes whitespace only. It does not remove bidi and format
 * characters (U+200E LRM, U+200F RLM, U+061C ALM, ZWSP, word joiner), which
 * are exactly what an RTL build or a templating pipeline inserts around inline
 * text. packages/core strips the same class of character in Stage 0 for the
 * same reason.
 */
function normaliseIconName(text: string): string {
  return text.replace(/[\p{Cf}\s]/gu, '').toLowerCase();
}

/**
 * Ligature-form Material icons: `<mat-icon>send</mat-icon>`.
 *
 * The name is an icon IDENTIFIER rather than UI copy — Gemini's own
 * translation files never touch it. But it lives in a TEXT NODE, and
 * page-level machine translation rewrites text nodes; broken Material
 * ligatures are the well-known symptom, which is why Material's own guidance
 * is to mark icons `translate="no"`. So this form is treated as
 * locale-FRAGILE and reported as such, ranked below the attribute forms.
 */
/**
 * Whether a control carries a send icon, in either form.
 *
 * Exported and passed INTO the shared discriminator rather than duplicated
 * there: each site names its icons differently, and a copy of a site's rule
 * living in shared code is the drift that has already produced two defects
 * here.
 */
export function hasSendIcon(control: Element): boolean {
  if (deepQueryAll(control, SEND_ICON_ATTRIBUTE_SELECTOR).length > 0) return true;
  return findSendIconsByLigature(control).length > 0;
}

function findSendIconsByLigature(root: ParentNode): HTMLElement[] {
  return deepQueryAll<HTMLElement>(root, 'mat-icon').filter(
    (icon) => normaliseIconName(icon.textContent ?? '') === 'send',
  );
}

/** Whether an element is actually rendered. */
function isRenderedControl(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * The ancestors of a node, crossing open shadow boundaries.
 *
 * `Node.contains` stops at a shadow boundary while `deepQueryAll` does not, so
 * a containment guard written with `contains` silently fails to exclude a
 * wrapper exactly when the composer is inside a shadow root — the case this
 * adapter exists for. Same class as `closest` versus `closestAcrossShadow`.
 */
function ancestorsAcrossShadow(node: Element): Set<Element> {
  const out = new Set<Element>();
  let current: Element | null = node;
  let hops = 0;
  while (current !== null && hops < 24) {
    out.add(current);
    current = parentAcrossShadow(current);
    hops += 1;
  }
  return out;
}

/**
 * The bounded region a composer's controls live in.
 *
 * Starts ABOVE the composer, never inside it, and refuses `<body>` and
 * `<html>`: a region spanning the document makes every uniqueness test
 * meaningless, and it is how a sidebar button becomes "the single control
 * beside the composer".
 */
/** One level of the region walk, for the diagnostic. */
export interface RegionWalkStep {
  readonly hop: number;
  readonly tag: string;
  readonly marker: string;
  readonly controlsFound: number;
}

/** A control in the composer's region, described for the diagnostic. */
export interface RegionControl {
  readonly tag: string;
  readonly role: string | null;
  readonly accessibleName: string | null;
  readonly attributes: readonly string[];
  readonly ancestors: readonly string[];
  readonly visible: boolean;
  readonly hasSendIcon: boolean;
}

export interface SendSearchTrace {
  readonly composerResolved: boolean;
  readonly steps: readonly RegionWalkStep[];
  /** Every control in the chosen region, in full. This is what a
   *  discriminator gets designed against. */
  readonly regionControlDetail: readonly RegionControl[];
  readonly discriminator: DiscriminatorOutcome | null;
  readonly stoppedBecause:
    | 'found-region'
    | 'reached-body'
    | 'ran-out-of-ancestors'
    | 'hop-limit'
    | 'no-composer';
  readonly regionControls: number;
  readonly outcome: 'unique' | 'discriminated' | 'ambiguous' | 'none' | 'no-region';
}

/**
 * A short identifier for an element, for the diagnostic only.
 *
 * Attribute VALUES, not names, because writing a selector needs the value -
 * but only for the class/id/testid family, and only when they pass the same
 * conservative content test the fixture scrubber uses.
 */
function describeElement(element: Element): string {
  const bits = [element.tagName.toLowerCase()];
  for (const attribute of ['id', 'class', 'data-test-id', 'data-testid']) {
    const value = element.getAttribute(attribute);
    if (value === null || value.length === 0) continue;
    const safe = value.length > 60 || /[@]/u.test(value) || /\d{4,}/u.test(value);
    bits.push(`${attribute}="${safe ? '<withheld>' : value}"`);
  }
  return bits.join(' ');
}

/**
 * A control's accessible name, as far as a content script can compute it.
 *
 * Reported so the two controls in an ambiguous region can be told apart by a
 * reader. Guarded like every other value the diagnostic emits: an aria-label
 * is normally chrome, but a site can interpolate anything into one.
 */
function accessibleNameOf(element: Element): string | null {
  const direct = element.getAttribute('aria-label');
  if (direct !== null && direct.length > 0) return guardValue(direct);

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const parts = labelledBy
      .split(/\s+/u)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (parts.length > 0) return guardValue(parts);
  }

  const title = element.getAttribute('title');
  if (title !== null && title.length > 0) return guardValue(title);

  const text = (element.textContent ?? '').trim();
  return text.length > 0 ? guardValue(text) : null;
}

/** The same conservative content test the rest of the diagnostic uses. */
function guardValue(value: string): string {
  return value.length > 60 || /[@]/u.test(value) || /\d{4,}/u.test(value) ? '<withheld>' : value;
}

function describeRegionControl(control: HTMLElement): RegionControl {
  const rect = control.getBoundingClientRect();
  return {
    tag: control.tagName.toLowerCase(),
    role: control.getAttribute('role'),
    accessibleName: accessibleNameOf(control),
    attributes: Array.from(control.attributes)
      .map((a) => `${a.name}="${guardValue(a.value)}"`)
      .sort()
      .slice(0, 24),
    ancestors: (() => {
      const chain: string[] = [];
      let node: Element | null = parentAcrossShadow(control);
      let hops = 0;
      while (node !== null && hops < 6) {
        chain.push(describeElement(node));
        node = parentAcrossShadow(node);
        hops += 1;
      }
      return chain;
    })(),
    visible: rect.width > 0 && rect.height > 0,
    hasSendIcon: hasSendIcon(control),
  };
}

/**
 * How far the walk may climb before giving up.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS NUMBER DOES NO SAFETY WORK, and treating it as though it did caused
 * the opposite failure to the one it was meant to fix.
 *
 * The adversarial review found the walk reaching `<body>` and binding a
 * sidebar button as the send control. Two things were changed in response:
 * an explicit stop at `body`/`documentElement`, and a reduction of this
 * bound from 6 to 4. **Only the first of those was the fix.** The body stop
 * is what prevents the dangerous case; this number only stops a pathological
 * loop.
 *
 * At 4 it then failed the other way: an Angular composer sits five or six
 * levels below its toolbar container, so the walk terminated before reaching
 * it and returned nothing - indistinguishable from "no controls exist".
 * A bound that is too tight and one that is too loose look identical from
 * outside, which is exactly why the walk is now TRACED rather than trusted.
 *
 * Raised to a loop guard rather than a semantic limit. The semantic limits
 * are the body stop above and the ambiguity rule below: a region large enough
 * to contain several controls refuses rather than choosing, so climbing too
 * far cannot bind the wrong thing - it can only fail loudly.
 * ─────────────────────────────────────────────────────────────────────────
 */
const REGION_WALK_LIMIT = 20;

function walkRegion(composer: Element): { region: Element | null; trace: SendSearchTrace } {
  const doc = composer.ownerDocument;
  const steps: RegionWalkStep[] = [];
  let region: Element | null = parentAcrossShadow(composer);
  let hops = 0;

  while (region !== null && hops < REGION_WALK_LIMIT) {
    if (region === doc.body || region === doc.documentElement) {
      return {
        region: null,
        trace: {
          composerResolved: true,
          steps,
          regionControlDetail: [],
          discriminator: null,
          stoppedBecause: 'reached-body',
          regionControls: 0,
          outcome: 'no-region',
        },
      };
    }
    const controls = controlsBeside(region, composer);
    steps.push({
      hop: hops,
      tag: region.tagName.toLowerCase(),
      marker: describeElement(region),
      controlsFound: controls.length,
    });
    if (controls.length > 0) {
      const detail = controls.slice(0, 8).map(describeRegionControl);
      if (controls.length === 1) {
        return {
          region,
          trace: {
            composerResolved: true,
            steps,
            regionControlDetail: detail,
            discriminator: null,
            stoppedBecause: 'found-region',
            regionControls: 1,
            outcome: 'unique',
          },
        };
      }
      // Several controls: ask which one IS the send control, by positive
      // properties only. Refusal remains the default if none identifies
      // exactly one.
      const outcome = discriminateSendControl(controls, composer, hasSendIcon);
      return {
        region,
        trace: {
          composerResolved: true,
          steps,
          regionControlDetail: detail,
          discriminator: outcome,
          stoppedBecause: 'found-region',
          regionControls: controls.length,
          outcome: outcome.control !== null ? 'discriminated' : 'ambiguous',
        },
      };
    }
    region = parentAcrossShadow(region);
    hops += 1;
  }

  return {
    region: null,
    trace: {
      composerResolved: true,
      steps,
      regionControlDetail: [],
      discriminator: null,
      stoppedBecause: region === null ? 'ran-out-of-ancestors' : 'hop-limit',
      regionControls: 0,
      outcome: 'no-region',
    },
  };
}

function regionAroundComposer(composer: Element): Element | null {
  return walkRegion(composer).region;
}

/** The send control identified by the composer-anchored path, if any. */
function sendControlFromComposer(root: ParentNode): HTMLElement[] {
  const composer = resolveComposerIndependently(root);
  if (composer === null) return [];
  const { region, trace } = walkRegion(composer);
  if (region === null) return [];
  if (trace.outcome === 'unique') return controlsBeside(region, composer);
  if (trace.outcome === 'discriminated' && trace.discriminator?.control != null) {
    return [trace.discriminator.control];
  }
  return [];
}

/**
 * The region walk, described for the diagnostic.
 *
 * Without this, the composer-anchored path fails INDISTINGUISHABLY from a
 * marker clause: both report "send-button: not-found". They need opposite
 * fixes - a walk that terminates too early versus a region that legitimately
 * holds several controls and needs a discriminator - so the diagnostic has to
 * say which happened.
 */
export function describeSendSearch(doc: Document): SendSearchTrace {
  const composer = resolveComposerIndependently(doc);
  if (composer === null) {
    return {
      composerResolved: false,
      steps: [],
      regionControlDetail: [],
      discriminator: null,
      stoppedBecause: 'no-composer',
      regionControls: 0,
      outcome: 'no-region',
    };
  }
  return walkRegion(composer).trace;
}

/** Rendered controls inside `region` that are neither the composer, nor inside it, nor around it. */
function controlsBeside(region: ParentNode, composer: Element): HTMLElement[] {
  const composerAncestors = ancestorsAcrossShadow(composer);
  const inComposer = new Set(deepQueryAll<Element>(composer, CONTROL_SELECTOR));
  return deepQueryAll<HTMLElement>(region, CONTROL_SELECTOR).filter(
    (control) =>
      control !== composer &&
      !inComposer.has(control) &&
      !composerAncestors.has(control) &&
      isRenderedControl(control),
  );
}

/** The composer, resolved WITHOUT the strategy that depends on the send control. */
function resolveComposerIndependently(root: ParentNode): HTMLElement | null {
  // Excluding `composer-in-send-region` is what stops this recursing: that
  // strategy calls findSendButtons, which calls back here. Anchoring in both
  // directions is a cycle, not two fallbacks.
  const independent = GEMINI_COMPOSER_STRATEGIES.filter(
    (strategy) => strategy.id !== 'gemini/composer-in-send-region',
  );
  const resolved = resolveUnique('composer', root, independent, COMPOSER_INVARIANTS);
  return resolved.ok ? resolved.value.node : null;
}

/** Distinct elements, preserving order. */
function distinct(elements: readonly HTMLElement[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const element of elements) if (!out.includes(element)) out.push(element);
  return out;
}

/**
 * The controls that submit the composer.
 *
 * TIERED, AND AMBIGUITY IS A FAILURE AT EVERY TIER. Two distinct candidates in
 * one tier returns nothing with `ambiguous: true`, exactly as the composer
 * resolver does — because binding the wrong control means a send that is never
 * intercepted, which is unmasked text leaving the machine. That is the same
 * consequence as resolving the wrong composer, so it gets the same rule.
 *
 * EVERY TIER IS SCOPED TO THE COMPOSER'S REGION except the marker tier. A
 * `send` glyph is the default icon for share, export and feedback controls, so
 * an unscoped icon clause binds whichever one it reaches first.
 */
function findSendButtons(root: ParentNode): SendControlResult {
  const composer = resolveComposerIndependently(root);
  const region = composer === null ? null : regionAroundComposer(composer);

  const decide = (
    candidates: readonly HTMLElement[],
    provenance: SendProvenance,
  ): SendControlResult | null => {
    const found = distinct(candidates.filter(isRenderedControl));
    if (found.length === 0) return null;
    if (found.length > 1) return { buttons: [], provenance, ambiguous: true };
    return { buttons: found, provenance, ambiguous: false };
  };

  const controlOf = (element: Element): HTMLElement | null => {
    const control = element.matches(CONTROL_SELECTOR)
      ? element
      : closestAcrossShadow(element, CONTROL_SELECTOR);
    return control instanceof HTMLElement ? control : null;
  };

  const withinRegion = (control: HTMLElement): boolean =>
    region !== null && deepQueryAll<Element>(region, CONTROL_SELECTOR).includes(control);

  // Tier 1: declared markers, document-wide. A test id naming the send button
  // is specific enough not to need scoping.
  const byMarker = deepQueryAll<HTMLElement>(root, SEND_MARKER_SELECTOR)
    .map(controlOf)
    .filter((el): el is HTMLElement => el !== null);
  const marker = decide(byMarker, 'marker');
  if (marker !== null) return marker;

  // Tier 2: attribute-form icons, scoped to the composer region.
  const byIconAttribute = deepQueryAll<HTMLElement>(root, SEND_ICON_ATTRIBUTE_SELECTOR)
    .map(controlOf)
    .filter((el): el is HTMLElement => el !== null)
    .filter(withinRegion);
  const iconAttribute = decide(byIconAttribute, 'icon-attribute');
  if (iconAttribute !== null) return iconAttribute;

  // Tier 3: ligature-form icons, scoped. Locale-fragile; reported as such.
  const byLigature = findSendIconsByLigature(root)
    .map(controlOf)
    .filter((el): el is HTMLElement => el !== null)
    .filter(withinRegion);
  const ligature = decide(byLigature, 'icon-ligature');
  if (ligature !== null) return ligature;

  // Tier 4: the English accessible name.
  //
  // ORDERED ABOVE the positional tier, which inverts the usual "English last"
  // rule deliberately. The rule exists so a strategy does not silently fail
  // for non-English users - and this ordering cannot cause that, because for a
  // non-English UI this clause matches nothing and falls straight through to
  // the positional tier exactly as before. It only changes what an ENGLISH
  // user gets, and there it gives a match with actual SEND EVIDENCE (the
  // accessible name says so) in place of one with none at all. A wrong
  // positional guess binds the attach button; a wrong English match is far
  // less likely. Both still warn.
  const byEnglish = deepQueryAll<HTMLElement>(root, '[aria-label="Send message" i]')
    .map(controlOf)
    .filter((el): el is HTMLElement => el !== null);
  const english = decide(byEnglish, 'english-label');
  if (english !== null) return english;

  // Tier 5: the single rendered control beside the composer. Markup-agnostic,
  // and the guessiest path in the file - it has NO send evidence at all, only
  // position. Bounded to the composer's own region, excludes anything inside
  // or around the composer, and refuses when the region holds more than one.
  const near = decide(sendControlFromComposer(root), 'near-composer');
  if (near !== null) return near;

  return { buttons: [], provenance: null, ambiguous: false };
}

export const GEMINI_COMPOSER_STRATEGIES: readonly ElementStrategy<HTMLElement>[] = [
  {
    id: 'gemini/composer-role-textbox',
    tier: 'attribute',
    assumes:
      'The composer is a contenteditable carrying role="textbox" and aria-multiline="true". Both are set by the editor for accessibility rather than by page markup, and both are locale-independent. Searched across open shadow roots.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, '[contenteditable][role="textbox"][aria-multiline="true"]').filter(
        isEditableSurface,
      ),
  },
  {
    id: 'gemini/composer-multiline-labelled',
    tier: 'attribute',
    assumes:
      'The composer is a contenteditable with aria-multiline="true" and an aria-label. Only the PRESENCE of the label is used, never its value, so it holds in every locale.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, '[contenteditable][aria-multiline="true"][aria-label]').filter(
        isEditableSurface,
      ),
  },
  {
    id: 'gemini/composer-in-rich-textarea',
    tier: 'structural',
    assumes:
      'The composer is the single editable surface inside a <rich-textarea> custom element. Depends on the element name and containment rather than on any attribute, so it survives attribute renames.',
    find: (root) => {
      const found: HTMLElement[] = [];
      for (const host of deepQueryAll(root, 'rich-textarea')) {
        for (const candidate of deepQueryAll<HTMLElement>(host, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && !found.includes(candidate)) found.push(candidate);
        }
      }
      return found;
    },
  },
  {
    id: 'gemini/composer-in-send-region',
    tier: 'structural',
    assumes:
      'The composer and its send control share a bounded container. Anchors on the locale-independent send markers, walks up across shadow boundaries, then takes the editables inside. NOT INDEPENDENT COVERAGE: it is anchored on findSendButtons, so it returns nothing whenever the send control cannot be found - measured live, it matched 0 while four other strategies matched the composer. Treat it as a corroborator of the send control, never as a fallback for the composer.',
    find: (root) => {
      const found: HTMLElement[] = [];
      for (const button of findSendButtons(root).buttons) {
        const region = composerRegionOf(button);
        if (region === null) continue;
        for (const candidate of deepQueryAll<HTMLElement>(region, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && !found.includes(candidate)) found.push(candidate);
        }
      }
      return found;
    },
  },
  {
    id: 'gemini/composer-ql-editor',
    tier: 'class',
    assumes:
      'The composer is a Quill editor and carries the library\'s own .ql-editor class. Last resort: a class name, but library-owned rather than a generated utility class.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, 'div.ql-editor[contenteditable]').filter(isEditableSurface),
  },
];

export const GEMINI_RESPONSE_STRATEGIES: readonly ElementStrategy[] = [
  {
    id: 'gemini/response-main',
    tier: 'attribute',
    assumes:
      'The transcript lives inside the single main landmark. Required for accessibility, so unusually durable.',
    find: (root) => deepQueryAll(root, 'main, [role="main"]'),
  },
  {
    id: 'gemini/response-chat-window',
    tier: 'structural',
    assumes:
      'The transcript is the <chat-window> custom element. Deliberately NOT model-response or message-content: those match once per turn, which would be ambiguity on every conversation with more than one reply.',
    find: (root) => deepQueryAll(root, 'chat-window'),
  },
];

/**
 * The container holding both the composer and its send control.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DERIVED FROM THE RESOLVED CONTROL, not re-tested from markers.
 *
 * The previous version asked "does this ancestor contain a send marker or send
 * icon, and an editable?". That made identification and BINDING use two
 * different notions of what a send region is, and they could disagree: the
 * structural tier exists precisely for pages with no marker and no icon, so
 * whenever it was the tier that fired, this function found no region,
 * `originComposerOfButtonEvent` returned null, and every pointer send was
 * reported undecidable — an adapter that could identify the send control and
 * still not bind a click on it.
 *
 * This is the same defect as `editableWithinRegion` and `resolveUnique`
 * disagreeing about what counts as a candidate: two places deciding the same
 * question, failing as a healthy page that cannot send.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function composerRegionOf(from: Element): Element | null {
  const doc = from.ownerDocument;
  const resolved = findSendButtons(doc);
  const control = resolved.buttons[0];

  // The clicked element must BE the resolved control, or sit inside it.
  if (control === undefined) return null;
  if (control !== from && !ancestorsAcrossShadow(from).has(control)) return null;

  // Climb from the control to the first ancestor that also holds an editable.
  let region: Element | null = parentAcrossShadow(control);
  let hops = 0;
  while (region !== null && hops < 6) {
    if (region === doc.body || region === doc.documentElement) return null;
    if (deepQueryAll<HTMLElement>(region, EDITABLE_SELECTOR).some(isEditableSurface)) return region;
    region = parentAcrossShadow(region);
    hops += 1;
  }
  return null;
}

export class GeminiAdapter implements SiteAdapter {
  readonly id = 'gemini' as const;
  readonly displayName = 'Gemini';

  private readonly document: Document;
  private readonly witness: InputWitness;

  constructor(doc: Document, witness: InputWitness) {
    this.document = doc;
    this.witness = witness;
  }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === 'gemini.google.com';
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.document.readyState !== 'loading' && this.getComposer().ok;
  }

  getComposer(): Resolution<ComposerHandle> {
    return resolveUnique('composer', this.document, GEMINI_COMPOSER_STRATEGIES, COMPOSER_INVARIANTS);
  }

  getComposerText(handle: ComposerHandle): string {
    return readEditableText(handle.node);
  }

  setComposerText(handle: ComposerHandle, text: string): WriteResult {
    const result = writeAndVerify(handle, text, writeEditableText, readEditableText);
    if (result.ok) this.witness.creditOwnWrite(handle.node);
    return result;
  }

  onSubmitIntent(callback: (intent: SubmitIntent) => void): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const origin = originComposerOfKeyEvent(event);
      if (origin === null) return;
      callback({
        kind: 'key',
        event,
        originComposer: origin,
        suppress: () => {
          event.preventDefault();
          event.stopPropagation();
        },
      });
    };

    const onClick = (event: MouseEvent): void => {
      const target = event.composedPath()[0];
      if (!(target instanceof Element)) return;
      const sendButtons = findSendButtons(this.document).buttons;
      const clickedSend = sendButtons.some((button) => button === target || button.contains(target));
      if (!clickedSend) return;
      callback({
        kind: 'button',
        event,
        originComposer: originComposerOfButtonEvent(event, composerRegionOf),
        suppress: () => {
          event.preventDefault();
          event.stopPropagation();
        },
      });
    };

    this.document.addEventListener('keydown', onKeyDown, { capture: true });
    this.document.addEventListener('click', onClick, { capture: true });
    return () => {
      this.document.removeEventListener('keydown', onKeyDown, { capture: true });
      this.document.removeEventListener('click', onClick, { capture: true });
    };
  }

  getConversationId(): string | null {
    return CONVERSATION_PATH.exec(this.document.location.pathname)?.[1] ?? null;
  }

  getResponseRoot(): Resolution<ElementHandle> {
    return resolveUnique(
      'response-root',
      this.document,
      GEMINI_RESPONSE_STRATEGIES,
      RESPONSE_ROOT_INVARIANTS,
    );
  }

  observeResponseStream(callback: (event: ResponseStreamEvent) => void): () => void {
    const root = this.getResponseRoot();
    if (!root.ok) return () => undefined;
    const target = root.value.node;
    const observer = new MutationObserver((records) => {
      const changed = collectChangedTextNodes(records);
      if (changed.length > 0) callback({ root: target, changedTextNodes: changed });
    });
    observer.observe(target, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }

  healthCheck(): HealthReport {
    const failures: ResolutionFailure[] = [];
    const warnings: HealthWarning[] = [];

    const composer = this.getComposer();
    if (composer.ok) {
      if (composer.value.tier !== 'attribute') {
        warnings.push({
          target: 'composer',
          tier: composer.value.tier,
          detail:
            `The composer was found only at the '${composer.value.tier}' tier by '${composer.value.strategyId}'. ` +
            'Detection still works, but the strongest strategies no longer match, which usually means the site changed.',
        });
      }
    } else {
      failures.push(composer.failure);
    }

    const responseRoot = this.getResponseRoot();
    if (!responseRoot.ok) failures.push(responseRoot.failure);

    const send = findSendButtons(this.document);
    if (send.ambiguous) {
      // Same rule as the composer: two candidates is a refusal, not a choice.
      // Binding the wrong control means a send that is never intercepted.
      failures.push({
        kind: 'ambiguous',
        target: 'send-button',
        detail:
          `Two or more distinct send controls matched at the '${send.provenance}' tier. ` +
          'Refusing to choose between them.',
        triedStrategies: ['gemini/send-button'],
      });
    } else if (send.buttons.length === 0) {
      failures.push({
        kind: 'not-found',
        target: 'send-button',
        detail: 'No send control matched, so pointer sends would be undecidable.',
        triedStrategies: ['gemini/send-button'],
      });
    } else if (send.provenance !== 'marker') {
      // PROVENANCE IS REPORTED. A control found by the guessiest path
      // reporting identically to one found by a declared test id is how a weak
      // result gets trusted; each tier below `marker` says what it relied on.
      const why: Record<string, string> = {
        'icon-attribute':
          'matched only via a Material send icon attribute, not a declared test id.',
        'icon-ligature':
          'matched only via a Material LIGATURE icon name, which lives in a text node. ' +
          'Page-level machine translation rewrites text nodes, so this can break for a user ' +
          'running the page through a translator even though the site itself is localised.',
        'near-composer':
          'matched only by POSITION - it is the single rendered control beside the composer, ' +
          'with no send evidence at all. If the composer toolbar gains a second control this ' +
          'stops resolving, and if it is the wrong control nothing else will say so.',
        'english-label':
          'matched only via its English aria-label. On a non-English UI this clause matches ' +
          'nothing, so resolution would fall through to the positional tier or fail outright - ' +
          'either way this adapter is one relabelling away from not finding the send control.',
      };
      warnings.push({
        target: 'send-button',
        tier: send.provenance === 'icon-attribute' ? 'attribute' : 'class',
        detail: `The send control ${why[send.provenance ?? ''] ?? 'matched by a weak strategy.'}`,
      });
    }

    return { ok: failures.length === 0, failures, warnings, checkedAt: Date.now() };
  }
}
