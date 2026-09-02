/**
 * What runs detection, and what it does with the answer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPEC.md's content-script flow, steps 1-5, all of them:
 *   1. Identify site, load adapter, run healthCheck, warm the recognizer
 *   2. Intercept the submit BEFORE the page acts on it
 *   3. Run detection on what is about to be sent
 *   4. Mask, verify, and only then release
 *   5. The review panel: detections grouped by type, each with calibrated
 *      confidence and explanation, each individually revertible
 *
 * The controller SEQUENCES these. It decides nothing: every decision the gate
 * makes lives in sendGate.ts, where each has its own counterexamples.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ORDER OF THE GATE, AND WHY EACH STEP PRECEDES THE NEXT
 *
 *   suppress            FIRST, synchronously, before anything can await. An
 *                       await before preventDefault is a sent message.
 *   verifyBinding       the element detection ran on must BE the element this
 *                       event submits (D26 construction #2). Called, never
 *                       bypassed - a wrong getComposer() is caught here and
 *                       nowhere else.
 *   analyse             fresh, on the text as it is now. The debounced
 *                       findings may describe an older keystroke.
 *   required stages     a scan missing Stage 2 is not a scan. See
 *                       REQUIRED_STAGES.
 *   review              only if something was found, and only the user ends it
 *   apply + certify     splice the surrogates the PANEL SHOWED, then scan the
 *                       result for anything the user did not choose to keep
 *   write + verify      setComposerText re-reads what it wrote
 *   replay              the user's own action, once, under a one-shot token
 *
 * Every one of those steps can refuse. None of them can fall through: the
 * catch-all sets a blocking state, and the send is simply never replayed.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE COMPOSER IS RE-RESOLVED, NOT REMEMBERED
 *
 * D34i and D38a: the composer element is replaced out from under us - Gemini
 * on SPA navigation, ChatGPT on a conversation switch. A handle captured once
 * and held is a handle that goes stale silently, because a detached element
 * still answers every method you call on it. So the composer is re-resolved on
 * every pass, the input listener is re-bound whenever the NODE identity
 * changes, and the surface's `onAnchorLost` triggers an immediate re-resolve
 * rather than waiting for the next poll.
 *
 * A conversation switch also clears the session: the vault held originals from
 * a message the user has left, and a revert decided about that message is not
 * a decision about this one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED, NOW WITH SOMETHING TO CLOSE
 *
 * SPEC: "Any detection error, timeout, or adapter failure blocks the send."
 * A failure anywhere in the gate leaves the message in the composer, unsent
 * and unmodified, and puts the surface into DEGRADED. The user loses a
 * keystroke; they do not lose the value.
 *
 * The failure that must never happen is the opposite one, and it has a
 * specific shape: an error resolving to "nothing found" and the send going
 * through. "Found nothing" and "could not look" are indistinguishable to a
 * user, and only one of them is safe - so nothing in this file releases a
 * message on any path other than a completed, certified gate.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  EntityType,
  NerRecognizer,
  SensitivityProfile,
  SubstitutionMode,
  UserLists,
} from '@privacyshield/core';
import { PROFILES, Vault } from '@privacyshield/core';

import type {
  ComposerHandle,
  ResponseStreamEvent,
  SiteAdapter,
  SubmitIntent,
} from '../adapters/index.js';
import { verifyBinding } from '../adapters/index.js';
import type { InputWitness } from '../adapters/index.js';
import { Surface } from '../ui/surface.js';
import type { ReviewGroup, ReviewItem, SurfaceState } from '../ui/surfaceState.js';
import {
  composerTemporarilyDisabled,
  sendControlNotExpected,
  surfaceStateFor,
} from '../ui/surfaceState.js';
import { analyzeText } from './analyze.js';
import { DomRestorer } from './restore.js';
import { renderSubmitRefusal } from '../debug.js';
import type { AnalyzedEntity, Analysis } from './analyze.js';
import { DetectionSession } from './session.js';
import type { SessionSummary } from './sessionLog.js';
import { recordMasked } from '../storage/insights.js';
import { DEFAULT_SETTINGS, loadSettings, typeEnabled } from '../storage/settings.js';
import type { Settings } from '../storage/settings.js';
import { applyMasking, certifyForRelease, missingStages, PassThrough } from './sendGate.js';

/**
 * How long after the last keystroke analysis runs.
 *
 * Analysis is fast - M3 measured Stage 0+1 at p50 0.14 ms - so this is not
 * about cost. It is about the panel: re-rendering the list on every keystroke
 * makes it flicker while a value is half-typed, and a partially-typed IBAN
 * legitimately matches nothing until its last character.
 */
const DEBOUNCE_MS = 180;

/**
 * How long after the last response mutation the settle re-scan runs.
 *
 * Long enough that a streaming response does not trigger it repeatedly, short
 * enough that a user reading the answer sees their own values restored rather
 * than noticing surrogates and wondering.
 */
const SETTLE_MS = 400;

/**
 * How long a health failure must PERSIST before the panel says so.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Measured on the live claude.ai, 2026-09-02, in one page load with no reload:
 *
 *   reading #1     7 ms   composer not-found      (126-element shell)
 *   reading #2   434 ms   composer invariant      (6 of 7 editables sit
 *                                                  inside an aria-hidden
 *                                                  subtree mid-transition)
 *   reading #3  2325 ms   composer RESOLVED, health ok
 *
 * Both failures were real readings of a real DOM, and both described a page
 * that was still assembling itself. Reporting either to the user is reporting
 * a broken site that is not broken - and "PrivacyShield is not protecting this
 * page" is the loudest thing this extension says.
 *
 * So a failure has to last before it is shown. 2500 ms clears the transition
 * measured above with room, and is far shorter than a user reading a reply.
 *
 * THIS CHANGES WHAT IS DISPLAYED AND NEVER WHAT IS ALLOWED. The send gate does
 * its own resolution at submit time and refuses on its own terms; nothing in
 * the gate consults the surface state. A send attempted during the grace
 * window still fails closed, and a test pins exactly that.
 * ─────────────────────────────────────────────────────────────────────────
 */
const DEGRADED_GRACE_MS = 2500;

/** The surface's custom element name, which restoration must not write into. */
const SURFACE_HOST_TAG = 'privacyshield-surface';

export interface ControllerOptions {
  readonly adapter: SiteAdapter;
  readonly document: Document;
  /**
   * The same witness the adapter was built with.
   *
   * Required rather than optional: `verifyBinding` cannot run without it, and
   * a gate that skipped the witness check would accept a composer-shaped
   * element the user never typed into (D26 construction #3).
   */
  readonly witness: InputWitness;
  /**
   * Stage 2. Required so it cannot be forgotten, null while the model is not
   * bundled - see analyze.ts.
   */
  readonly ner: NerRecognizer | null;
  /** Reported instead of thrown, so the caller decides what a failure means. */
  readonly onError: (error: unknown) => void;
}

export class DetectionController {
  private readonly options: ControllerOptions;
  private readonly surface: Surface;
  private readonly session = new DetectionSession();

  /** The composer node the input listener is bound to, if any. */
  private boundComposer: HTMLElement | null = null;
  private unbindInput: (() => void) | null = null;
  private debounce: number | null = null;
  private lastEntities: readonly AnalyzedEntity[] = [];
  private lastExposure = 0;

  /** Resolves when the user answers the review panel. Null when none is open. */
  private pendingDecision: ((released: boolean) => void) | null = null;
  /** One-shot permission for the gate to replay a send it just approved. */
  private readonly passThrough = new PassThrough();
  /**
   * The exact text this extension last wrote into the composer.
   *
   * Set by BOTH paths that write - the gate's confirm, and the paste guard's
   * "Mask now" - because the hazard is the same either way: a
   * format-preserving surrogate is by construction a VALID identifier, so
   * re-analysing text we already masked detects the surrogates and masks them
   * again, producing a surrogate for a surrogate.
   *
   * It also carries the gate's recovery path. If a replay does not take - the
   * site ignored the synthetic event, the button moved - the user presses send
   * again, and this is what makes the second attempt release what they already
   * approved instead of re-masking it.
   */
  private lastMaskedText: string | null = null;
  /**
   * The Options page's answers, refreshed when they change.
   *
   * Starts at DEFAULT_SETTINGS rather than at null, so an analysis that
   * happens before the first storage read uses the PROTECTIVE position -
   * balanced profile, every type on, no allowlist. The alternative is a
   * window in which a stale null means "no policy", and no policy is
   * indistinguishable from an empty one that permits everything.
   */
  private settings: Settings = DEFAULT_SETTINGS;
  private unsubscribeSubmit: (() => void) | null = null;
  private unsubscribeStream: (() => void) | null = null;
  /**
   * Rebuilt whenever the session's vault is replaced.
   *
   * The restorer holds the vault, and `session.clear()` swaps in a fresh one -
   * so a restorer built once at construction would go on restoring from a
   * vault nobody else is using, which is both wrong and a way to keep cleared
   * originals alive.
   */
  private restorer: DomRestorer;
  /** Re-scan after the stream stops moving; see `scheduleSettle`. */
  private settleTimer: number | null = null;
  /**
   * Who the surface currently belongs to.
   *
   * FOUND BY TEST, and it was a real defect rather than a test artefact: the
   * gate would refuse a send, and ~180 ms later the debounced analysis that
   * had been scheduled by the user's last keystroke would finish and overwrite
   * the refusal with the findings list. The user is told "not sent, here is
   * why", and then the explanation quietly disappears - which is the same
   * failure as never showing it.
   *
   * So a gate in progress, and a refusal it has left standing, OWN the
   * surface. Background analysis may not write over them. Ownership returns on
   * the next edit, because an edit is the user saying they have seen it.
   */
  private surfaceOwner: 'idle' | 'gate' | 'paste' = 'idle';
  /** When the current run of health failures began. Null while healthy. */
  private failingSince: number | null = null;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.restorer = new DomRestorer(this.session.vault, SURFACE_HOST_TAG);
    this.surface = new Surface(options.document, {
      onConfirm: () => this.resolveDecision(true),
      onCancel: () => this.resolveDecision(false),
      onToggleItem: (id) => this.toggleRevert(id),
      onMaskNow: () => this.maskNow(),
      onDismiss: () => this.dismissPaste(),
      onAnchorLost: () => this.refresh(),
      onSurfaceLost: () => this.options.onError(new Error('the surface could not stay attached')),
    });
  }

  start(): void {
    this.surface.mount();
    this.watchSettings();
    this.unsubscribeSubmit = this.options.adapter.onSubmitIntent((intent) => {
      this.onSubmit(intent);
    });
    // SPEC step 8. Subscribed once, for the life of the controller: the
    // response root is re-resolved by the adapter's own observer, and
    // re-subscribing on every refresh would drop mutations in the gap.
    this.unsubscribeStream = this.options.adapter.observeResponseStream((event) => {
      this.onResponseStream(event);
    });
    this.refresh();
  }

  /**
   * Re-resolve the composer and re-evaluate what the surface should show.
   *
   * Called on the health poll, on navigation, and whenever the surface reports
   * it lost its anchor.
   */
  refresh(): void {
    // Wrapped for the same reason `analyse` is: this runs on the health poll,
    // and an adapter that threw here would take the poll down with it - after
    // which nothing would ever re-check the page and the last state shown
    // would stand forever.
    try {
      const composer = this.options.adapter.getComposer();
      const node = composer.ok ? composer.value.node : null;

      if (node !== this.boundComposer) {
        // The composer was replaced. Anything derived from the old one
        // describes a message the user has left.
        this.bindInput(node);
        this.session.clear();
        this.restorer = new DomRestorer(this.session.vault, SURFACE_HOST_TAG);
        this.lastEntities = [];
        this.lastExposure = 0;
        this.surface.setAnchor(node);
      }

      if (this.surfaceOwner === 'idle') {
        this.surface.setState(this.stateForHealth(composer.ok ? composer.value : null));
      }
      if (composer.ok) this.scheduleAnalysis();
    } catch (error) {
      this.failClosed(error, 'The page could not be checked. This message has not been reviewed.');
    }
  }

  /** Clears everything a session may hold. SPEC: no plaintext survives. */
  destroy(): void {
    if (this.onSettingsChanged !== null) {
      try {
        chrome.storage.onChanged.removeListener(this.onSettingsChanged);
      } catch {
        // Registration is guarded the same way; if it never succeeded there
        // is nothing to remove.
      }
      this.onSettingsChanged = null;
    }
    this.unsubscribeSubmit?.();
    this.unsubscribeSubmit = null;
    this.unsubscribeStream?.();
    this.unsubscribeStream = null;
    this.cancelSettle();
    // A panel awaiting an answer must not be left with a promise nobody will
    // settle. Resolving it as NOT released is the only safe direction.
    this.resolveDecision(false);
    this.passThrough.disarm();
    this.surfaceOwner = 'idle';
    this.lastMaskedText = null;
    this.cancelDebounce();
    this.bindInput(null);
    this.session.clear();
    this.surface.destroy();
  }

  /**
   * Test seam: the panel's root, which is otherwise a closed shadow root
   * behind a private field.
   *
   * The same seam `Surface` already exposes, forwarded one level. The gate's
   * decisions are reachable only through the panel's buttons, and a test that
   * called `resolveDecision` directly would be testing the controller's
   * internals rather than the thing the user actually operates.
   */
  panelRootForTesting(): ShadowRoot | null {
    return this.surface.shadowRootForTesting();
  }

  // ── the paste guard (SPEC line 288) ───────────────────────────────────

  /**
   * Detection at paste time, as early warning.
   *
   * SPEC: "Submit-time remains the enforcement gate; paste guard is early
   * warning layered on top." So this does NOT preventDefault and does NOT
   * block: the paste happens exactly as the user asked, and if they ignore
   * the notice completely the send gate still catches everything in it.
   *
   * The text comes from the CLIPBOARD EVENT rather than from the composer
   * afterwards, because "in what you just pasted" is a claim about the pasted
   * content specifically - reading the composer would count what was already
   * there and report it as newly pasted.
   */
  private onPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text/plain') ?? '';
    if (pasted.length === 0) return;

    void this.summarisePaste(pasted).catch((error: unknown) => {
      // A failed paste summary is NOT escalated. It is an early warning whose
      // absence costs the user nothing that the send gate will not catch, and
      // blocking the surface over it would turn a convenience into an
      // obstacle. The gate's own failures still fail closed.
      this.options.onError(error);
    });
  }

  private async summarisePaste(pasted: string): Promise<void> {
    const analysis = await analyzeText(pasted, {
      ner: this.options.ner,
      ...this.policy(),
      seed: this.session.seed,
      // A SEPARATE vault: this analysis exists only to count what was pasted,
      // and registering its surrogates in the session vault would mint
      // entries for values that may not survive into the composer at all -
      // leaving the restorer looking for surrogates nobody ever sent.
      vault: new Vault(),
    });
    if (analysis.entities.length === 0) return;
    // The gate owns the surface once it starts; a notice arriving late must
    // not push a blocking decision off the screen.
    if (this.surfaceOwner === 'gate') return;

    const byLabel = new Map<string, number>();
    for (const entity of analysis.entities) {
      byLabel.set(entity.label, (byLabel.get(entity.label) ?? 0) + 1);
    }
    this.surfaceOwner = 'paste';
    this.surface.setState({
      kind: 'paste',
      summary: { counts: [...byLabel].map(([label, count]) => ({ label, count })) },
    });
  }

  /** SPEC's "one-tap mask now". Masks the composer; does NOT send. */
  private maskNow(): void {
    this.surfaceOwner = 'idle';
    const composer = this.options.adapter.getComposer();
    if (!composer.ok) {
      this.refuse('The composer could not be located, so nothing was masked.');
      return;
    }
    try {
      const text = this.options.adapter.getComposerText(composer.value);
      void this.analyseNow(text).then((analysis) => {
        this.applyMaskOnly(composer.value, text, analysis);
      }).catch((error: unknown) => {
        this.failClosed(error, 'Nothing was masked: the message could not be checked.');
      });
    } catch (error) {
      this.failClosed(error, 'Nothing was masked: the message could not be checked.');
    }
  }

  /**
   * Mask the composer in place, without releasing anything.
   *
   * The same apply-certify-write sequence the gate uses, minus the release -
   * so a value masked here is masked under exactly the checks a sent message
   * gets, and `lastMaskedText` is set so the eventual send does not mask the
   * surrogates a second time.
   */
  private applyMaskOnly(handle: ComposerHandle, original: string, analysis: Analysis): void {
    const isReverted = (id: string): boolean => this.session.isReverted(id);
    const plan = applyMasking(original, analysis.entities, isReverted);
    if (plan.applied.length === 0) {
      this.surface.setState({ kind: 'hidden' });
      return;
    }

    const certified = certifyForRelease(plan.maskedText, this.session.vault, isReverted);
    if (!certified.ok) {
      const types = [...new Set(certified.unaccountedLeaks.map((leak) => leak.type))];
      this.refuse(`Nothing was masked: the masking did not remove ${types.join(', ')}.`);
      return;
    }

    const write = this.options.adapter.setComposerText(handle, plan.maskedText);
    if (!write.ok) {
      this.refuse(`Nothing was masked: the text could not be written back. ${write.detail}`);
      return;
    }
    this.lastMaskedText = plan.maskedText;
    this.lastEntities = analysis.entities;
    this.lastExposure = analysis.exposure.score;
    this.recordRun(plan.applied, analysis);
    this.surface.setState({ kind: 'hidden' });
  }

  /** SPEC requires the notice be dismissible. */
  private dismissPaste(): void {
    this.surfaceOwner = 'idle';
    this.surface.setState({ kind: 'hidden' });
  }

  // ── streaming restoration (SPEC step 8) ───────────────────────────────

  /**
   * Restore surrogates in the response as it arrives.
   *
   * Deliberately does NOT report failures upward. Restoration is a display
   * concern: if it fails, the user sees a surrogate where their own value
   * should be - visible, and safe. Escalating that to the blocking degraded
   * state would take a cosmetic problem and use it to stop the user sending
   * anything, which is a worse outcome than the problem.
   *
   * That asymmetry is worth being explicit about, because everything else in
   * this file fails closed. The difference is direction: the gate protects
   * data on its way OUT, where the failure is a leak; restoration renders data
   * that is already home, where the failure is an inconvenience.
   */
  private onResponseStream(event: ResponseStreamEvent): void {
    try {
      this.restorer.apply(event.changedTextNodes);
      this.scheduleSettle(event.root);
    } catch (error) {
      this.options.onError(error);
    }
  }

  /**
   * One more pass once the stream stops moving.
   *
   * A surrogate split across text nodes is not restored (see restore.ts). Some
   * of those splits are transient - the site re-renders streaming markdown and
   * the fragments merge - so a re-scan after the mutations stop catches what
   * the per-mutation pass could not. Debounced, so a long response schedules it
   * once rather than per chunk.
   */
  private scheduleSettle(root: Node): void {
    this.cancelSettle();
    const view = this.options.document.defaultView;
    if (view === null) return;
    this.settleTimer = view.setTimeout(() => {
      this.settleTimer = null;
      try {
        this.restorer.applyToSubtree(root);
      } catch (error) {
        this.options.onError(error);
      }
    }, SETTLE_MS);
  }

  private cancelSettle(): void {
    if (this.settleTimer === null) return;
    this.options.document.defaultView?.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  // ── the send gate ──────────────────────────────────────────────────────

  /**
   * A user action that would send the composer's contents.
   *
   * SYNCHRONOUS UP TO `suppress()`, and that is not a style choice. Between
   * the event being dispatched and `preventDefault` being called there must be
   * no `await`: the microtask boundary is enough for the page's own handler to
   * run, and once it has run the message is gone. Everything asynchronous
   * happens after the event is already dead.
   */
  private onSubmit(intent: SubmitIntent): void {
    // Our own replay of a send the gate already approved. Consuming disarms,
    // so a second event cannot ride the same token.
    if (this.passThrough.consume()) return;

    intent.suppress();
    this.surfaceOwner = 'gate';

    // The replay target has to be captured NOW. `composedPath()` returns an
    // empty array once dispatch finishes, so reading it after the gate's first
    // await would silently yield nothing to replay.
    const replay = this.captureReplay(intent);

    void this.runGate(intent, replay).catch((error: unknown) => {
      // runGate handles its own failures; a rejection here means the handler
      // itself failed, and the message stays unsent either way.
      this.failClosed(error, 'The send could not be checked, so it was not sent.');
    });
  }

  /**
   * How to re-perform the user's action once the gate approves it.
   *
   * The user's OWN action on the SAME element, never a send control located by
   * a fresh document-wide search. That independence is the point of D26
   * construction #2, and a gate that re-acquired the send button by selector
   * would hand it back.
   */
  private captureReplay(intent: SubmitIntent): (() => void) | null {
    if (intent.kind === 'button') {
      const path = intent.event.composedPath();
      const target = path.find((node): node is HTMLElement => node instanceof HTMLElement);
      const button = target?.closest('button') ?? target ?? null;
      return button === null ? null : () => button.click();
    }
    const composer = intent.originComposer;
    if (composer === null) return null;
    const source = intent.event as KeyboardEvent;
    return () => {
      composer.focus();
      for (const type of ['keydown', 'keypress', 'keyup'] as const) {
        composer.dispatchEvent(
          new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
            ctrlKey: source.ctrlKey,
            metaKey: source.metaKey,
          }),
        );
      }
    };
  }

  private async runGate(intent: SubmitIntent, replay: (() => void) | null): Promise<void> {
    const composer = this.options.adapter.getComposer();
    if (!composer.ok) {
      this.refuse('The composer could not be located, so this message was not checked or sent.');
      return;
    }

    // D26 construction #2 and #3, and the only check that does not depend on a
    // selector being right. A wrong getComposer() means detection ran on the
    // wrong text, and this equality is what catches it.
    const binding = verifyBinding(composer.value, intent, this.options.witness);

    // ONE binding failure becomes a question instead of a refusal, and only
    // one. `verifyBinding` checks in order, so reaching `no-input-witness`
    // means everything before it PASSED: the event resolved to exactly one
    // editable, that element IS the one detection ran on, and it is still in
    // the document. The single unknown is whether the user typed the text.
    //
    // That is D29 - a restored draft, a URL prefill, a suggestion chip - and
    // it is undecidable from the DOM but not from the screen. So it goes to
    // the user (see `askForReview`), who is shown what will be sent and asked
    // to confirm it is theirs.
    //
    // Every other code still refuses outright, because each means we do not
    // know WHICH element is being submitted, and no question to the user can
    // establish that: `undecidable` (the event resolved to no editable or
    // several), `identity-mismatch` (detection ran on a different node than
    // the one being sent), `detached` (the composer left the document since).
    const unwitnessed = !binding.ok && binding.code === 'no-input-witness';
    if (!binding.ok && !unwitnessed) {
      // Emitted HERE, from the refusal itself, rather than left to a
      // diagnostic the user triggers afterwards. Every reading taken either
      // side of a refusal showed the composer resolving cleanly, which is the
      // opposite of what the refusal concluded - so the decision has to
      // report what IT was looking at, at the instant it made it.
      renderSubmitRefusal({
        intentKind: intent.kind,
        code: binding.code,
        detail: binding.detail,
        composerResolved: composer.ok,
        composerStrategy: composer.ok ? composer.value.strategyId : null,
      });
      this.refuse(`This message was not sent. ${binding.detail}`);
      return;
    }

    const text = this.options.adapter.getComposerText(composer.value);
    if (text.length === 0) {
      // Nothing to protect. Release without a panel: a gate that interrupted
      // an empty send would be noise, and there is no value at risk.
      this.release(replay);
      return;
    }

    // Already masked and approved, and the replay did not take. Re-analysing
    // would mask the surrogates again - they are valid identifiers by
    // construction - so this releases what the user already approved.
    if (this.lastMaskedText !== null && text === this.lastMaskedText) {
      this.release(replay);
      return;
    }

    let analysis: Analysis;
    try {
      analysis = await this.analyseNow(text);
    } catch (error) {
      this.failClosed(error, 'This message was not checked, so it was not sent.');
      return;
    }

    // The null-NER refusal, enforced rather than remembered. `stagesRun` is
    // derived from the recognizer argument, so a missing stage here is a fact
    // about what ran, not a claim about what was configured.
    const missing = missingStages(analysis.stagesRun);
    if (missing.length > 0) {
      this.refuse(
        `This message was not sent: it could not be fully checked (${missing.join(', ')} did not run).`,
      );
      return;
    }

    if (analysis.entities.length === 0 && !unwitnessed) {
      this.release(replay);
      return;
    }
    if (analysis.entities.length === 0) {
      // Nothing to mask, but the composer still holds text nobody saw typed.
      // The question D29 asks is "is this your message", which is not the same
      // question as "is there anything sensitive in it" - and releasing here
      // because the answer to the second is no would skip the first entirely.
      const approvedEmpty = await this.askForReview(analysis, true);
      if (!approvedEmpty) {
        this.surface.setState({ kind: 'hidden' });
        return;
      }
      this.options.witness.creditUserConfirmation(composer.value.node);
      this.release(replay);
      return;
    }

    this.lastEntities = analysis.entities;
    this.lastExposure = analysis.exposure.score;
    const approved = await this.askForReview(analysis, unwitnessed);
    if (!approved) {
      // Cancelled. The composer is untouched and nothing was sent; the user is
      // back where they were, with their text intact.
      this.surface.setState({ kind: 'hidden' });
      return;
    }

    if (unwitnessed) {
      // The user has now said this is their message. Recorded so the rest of
      // the session does not ask again about the same element - they answered
      // once, and answering is the decision.
      this.options.witness.creditUserConfirmation(composer.value.node);
    }
    this.applyAndRelease(composer.value, text, analysis, replay);
  }

  /** Mask, certify, write, verify, release. Any refusal stops the send. */
  private applyAndRelease(
    handle: ComposerHandle,
    original: string,
    analysis: Analysis,
    replay: (() => void) | null,
  ): void {
    const isReverted = (id: string): boolean => this.session.isReverted(id);
    const plan = applyMasking(original, analysis.entities, isReverted);

    // The last look before release. `guardEgress` scans for every original the
    // vault holds, including the ones a revert deliberately kept, so the leaks
    // are reconciled against the reverts: anything left over is a masking
    // defect - a missed span, a bad offset - and must not reach the network.
    const certified = certifyForRelease(plan.maskedText, this.session.vault, isReverted);
    if (!certified.ok) {
      const types = [...new Set(certified.unaccountedLeaks.map((leak) => leak.type))];
      this.refuse(
        `This message was NOT sent: masking did not remove ${types.join(', ')}. This is a bug in the extension, not in your message.`,
      );
      return;
    }

    if (plan.applied.length > 0) {
      const write = this.options.adapter.setComposerText(handle, plan.maskedText);
      if (!write.ok) {
        // `write.detail` carries the diagnosis - which reason, and the lengths
        // involved, never the content. Dropping it and printing only the
        // reason code left the one screen that could explain a failed write
        // saying `(readback-mismatch)` and nothing else.
        this.refuse(`This message was not sent: the masked text could not be written back. ${write.detail}`);
        return;
      }
    }

    this.lastMaskedText = plan.maskedText;
    this.recordRun(plan.applied, analysis);
    this.release(replay);
  }

  /**
   * Records a completed masking run: the session log, and the persisted counts.
   *
   * Called only from the two paths that ACTUALLY MASKED something the user
   * then keeps — the send gate after certification, and paste "mask now".
   * Analysis alone is not a run: detecting an email while someone is still
   * typing is not protection, and counting it would make both the popup and
   * Local Insights report work that never happened.
   *
   * The Insights write is deliberately not awaited. It runs after the message
   * is already masked and certified, nothing downstream depends on it, and a
   * slow or full disk must not sit in the path between the user pressing send
   * and the send happening.
   */
  private recordRun(applied: readonly AnalyzedEntity[], analysis: Analysis): void {
    this.session.log.record(
      applied.map((entity) => ({ type: entity.type, confidence: entity.confidence })),
      analysis.exposure.score,
    );
    void recordMasked(applied.map((entity) => entity.type));
  }

  /**
   * Hand the send back to the page.
   *
   * Arming and replaying is the whole of it, and the token is disarmed in a
   * `finally` so a throwing replay cannot leave one live for a later send to
   * consume.
   */
  private release(replay: (() => void) | null): void {
    this.surfaceOwner = 'idle';
    this.surface.setState({ kind: 'hidden' });
    if (replay === null) {
      // Nothing to replay: the action could not be reconstructed. The text is
      // masked and safe, but the user has to press send themselves, and being
      // told that is better than a message that silently never goes.
      this.refuse('Your message is masked and ready. Press send again to send it.');
      return;
    }
    this.passThrough.arm();
    try {
      replay();
    } finally {
      this.passThrough.disarm();
    }
  }

  /**
   * What this session has masked, for the popup.
   *
   * A snapshot rather than the log itself, so nothing outside this class can
   * hold a reference that survives `session.clear()` — the popup reporting the
   * previous conversation's counts is exactly the leak `clear()` exists to
   * prevent.
   */
  sessionSummary(): SessionSummary {
    return this.session.log.summary();
  }

  /** Opens the review panel and waits for the user. */
  private askForReview(analysis: Analysis, unwitnessed = false): Promise<boolean> {
    this.resolveDecision(false);
    this.surface.setState({
      kind: 'review',
      content: {
        groups: this.group(analysis.entities),
        exposureScore: analysis.exposure.score,
        ...(unwitnessed ? { unwitnessed: true } : {}),
      },
    });
    return new Promise<boolean>((resolve) => {
      this.pendingDecision = resolve;
    });
  }

  private resolveDecision(released: boolean): void {
    const pending = this.pendingDecision;
    this.pendingDecision = null;
    pending?.(released);
  }

  /**
   * A refusal with a reason the user can read. Never releases.
   *
   * Keeps surface ownership: the refusal must stand until the user has had a
   * chance to read it, and the next thing they do to the composer is what
   * hands the surface back.
   */
  private refuse(detail: string): void {
    this.surfaceOwner = 'gate';
    this.surface.setState({
      kind: 'degraded',
      failures: [{ kind: 'invariant', target: 'send', detail, triedStrategies: [] }],
    });
  }

  private analyseNow(text: string): Promise<Analysis> {
    return analyzeText(text, {
      ner: this.options.ner,
      ...this.policy(),
      seed: this.session.seed,
      vault: this.session.vault,
    });
  }

  /**
   * The parts of an analysis that come from the user's settings.
   *
   * One place, so the three call sites cannot drift - the paste guard warning
   * about something the send gate would not mask, or the reverse, is a
   * contradiction the user has no way to resolve.
   */
  private policy(): {
    readonly profile: SensitivityProfile;
    readonly mode: SubstitutionMode;
    readonly lists: UserLists;
    readonly typeAllowed: (type: EntityType) => boolean;
    readonly defaultRegion?: string;
  } {
    return {
      profile: PROFILES[this.settings.profile],
      mode: this.settings.mode,
      lists: { allow: this.settings.allowlist, deny: this.settings.denylist },
      typeAllowed: (type) => typeEnabled(type, this.settings),
      ...(this.settings.phoneRegion.length === 2
        ? { defaultRegion: this.settings.phoneRegion }
        : {}),
    };
  }

  /** Reads the Options page's answers, and keeps reading them. */
  private watchSettings(): void {
    void loadSettings().then((settings) => {
      this.settings = settings;
    });
    this.onSettingsChanged = (changes, areaName) => {
      if (areaName !== 'local' || !('settings' in changes)) return;
      void loadSettings().then((settings) => {
        this.settings = settings;
      });
    };
    try {
      chrome.storage.onChanged.addListener(this.onSettingsChanged);
    } catch {
      // No extension context - a test, or the playground. `loadSettings()`
      // has already fallen back to the protective defaults, and there is
      // nothing to be notified about because nothing can change them.
      this.onSettingsChanged = null;
    }
  }

  private onSettingsChanged:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;

  // ── internals ──────────────────────────────────────────────────────────

  /**
   * The health-derived state: DEGRADED, INACTIVE, or nothing to say.
   *
   * The evidence and the health report are produced in one synchronous pass,
   * which the freshness check in surfaceState.ts requires - evidence gathered
   * before a check describes a page that may since have changed.
   */
  private stateForHealth(handle: ComposerHandle | null): SurfaceState {
    const health = this.options.adapter.healthCheck();
    if (health.failures.length === 0) this.failingSince = null;
    else this.failingSince ??= health.checkedAt;
    const evidence = [];

    const missingSend = health.failures.some((failure) => failure.target === 'send-button');
    if (missingSend && handle !== null) {
      const found = sendControlNotExpected(handle.node, (element) =>
        this.options.adapter.getComposerText({ ...handle, node: element }),
      );
      if (found !== null) evidence.push(found);
    }
    for (const failure of health.failures) {
      const found = composerTemporarilyDisabled(failure);
      if (found !== null) evidence.push(found);
    }
    const state = surfaceStateFor(health, evidence);
    if (state.kind !== 'degraded') return state;

    // A failure that has not lasted is a page still assembling itself, not a
    // broken one. See DEGRADED_GRACE_MS - and note this suppresses only the
    // MESSAGE; the send gate resolves independently and still refuses.
    const since = this.failingSince;
    if (since !== null && health.checkedAt - since < DEGRADED_GRACE_MS) {
      return { kind: 'hidden' };
    }
    return state;
  }

  private bindInput(node: HTMLElement | null): void {
    this.unbindInput?.();
    this.unbindInput = null;
    this.boundComposer = node;
    if (node === null) return;

    const onInput = (): void => {
      // The user has moved on from whatever the gate or the paste notice last
      // said, so the findings list may take the surface back.
      this.surfaceOwner = 'idle';
      this.scheduleAnalysis();
    };
    const onPaste = (event: Event): void => {
      this.onPaste(event as ClipboardEvent);
    };
    // Bound to the composer rather than the document: a document-wide listener
    // would re-run analysis for every input on the page, including the site's
    // own search box.
    node.addEventListener('input', onInput);
    node.addEventListener('paste', onPaste);
    this.unbindInput = () => {
      node.removeEventListener('input', onInput);
      node.removeEventListener('paste', onPaste);
    };
  }

  private cancelDebounce(): void {
    if (this.debounce === null) return;
    this.options.document.defaultView?.clearTimeout(this.debounce);
    this.debounce = null;
  }

  private scheduleAnalysis(): void {
    this.cancelDebounce();
    const view = this.options.document.defaultView;
    // `analyse` handles its own failures, so a rejection here would mean the
    // handler itself failed. Reported rather than voided: an unhandled
    // rejection in a content script is both noisy on the host page and
    // invisible to us, which is the worst pair of properties for the one code
    // path whose job is to make failure visible.
    const run = (): void => {
      this.analyse().catch((error: unknown) => this.options.onError(error));
    };
    if (view === null) {
      run();
      return;
    }
    this.debounce = view.setTimeout(() => {
      this.debounce = null;
      run();
    }, DEBOUNCE_MS);
  }

  private async analyse(): Promise<void> {
    // A gate in progress, a refusal standing, or a paste notice the user has
    // not answered, owns the surface. See `surfaceOwner`.
    if (this.surfaceOwner !== 'idle') return;

    // EVERY adapter call is inside the try, including the ones that merely
    // read. The first version resolved and read the composer above it, so an
    // adapter that threw on read produced an unhandled rejection and left the
    // panel showing whatever it had been showing - which, on a page where
    // nothing had been found yet, is an empty panel. That is the precise
    // shape of the failure this method exists to prevent, one line outside
    // the guard that prevents it.
    try {
      const composer = this.options.adapter.getComposer();
      if (!composer.ok) {
        // Not an error: the health pass already decided what this means, and
        // it holds the evidence needed to tell "gone" from "not applicable
        // here".
        this.surface.setState(this.stateForHealth(null));
        return;
      }

      const text = this.options.adapter.getComposerText(composer.value);
      const generation = this.session.beginAnalysis();

      if (text.length === 0) {
        this.lastEntities = [];
        this.lastExposure = 0;
        // The HEALTH-derived state, not a bare `hidden`. An empty composer
        // means there is nothing to report about the MESSAGE; it says nothing
        // about whether the page is healthy. Setting `hidden` here wiped a
        // standing degraded warning roughly 180 ms after it appeared - the
        // same shape as D42a, where the debounced analysis overwrote the
        // gate's refusal. Found by a test written for the grace period.
        this.surface.setState(this.stateForHealth(composer.value));
        return;
      }

      const analysis = await analyzeText(text, {
        ner: this.options.ner,
        ...this.policy(),
        seed: this.session.seed,
        vault: this.session.vault,
      });
      // A slower run that started earlier must not overwrite a faster one
      // that started later: the panel would then describe text the user has
      // already replaced.
      if (!this.session.isCurrent(generation)) return;

      this.lastEntities = analysis.entities;
      this.lastExposure = analysis.exposure.score;
      this.surface.setState(
        analysis.entities.length === 0
          ? // The HEALTH state, not a bare `hidden` - the same defect as the
            // empty-composer branch above. "Nothing sensitive was found" is a
            // statement about the MESSAGE; it says nothing about whether the
            // page is healthy, and setting `hidden` here wiped a standing
            // degraded warning about 180 ms after it appeared.
            this.stateForHealth(composer.value)
          : {
              kind: 'findings',
              content: {
                groups: this.group(analysis.entities),
                exposureScore: analysis.exposure.score,
              },
            },
      );
    } catch (error) {
      this.failClosed(error, 'Detection did not complete. The message has not been checked.');
    }
  }

  /**
   * The state a failure leaves behind.
   *
   * Never an empty panel: "found nothing" and "could not look" are
   * indistinguishable to a user, and only one of them is safe. DEGRADED is
   * also the state an adapter failure produces and the state the send gate
   * will read, so a detection failure and a page failure converge on the same
   * blocking condition rather than on two that have to be kept in step.
   *
   * The stale results are dropped too. Leaving them would mean the next
   * revert re-rendered a panel describing an analysis that is known to be
   * wrong.
   */
  private failClosed(error: unknown, detail: string): void {
    this.lastEntities = [];
    this.lastExposure = 0;
    this.options.onError(error);
    this.surface.setState({
      kind: 'degraded',
      failures: [{ kind: 'invariant', target: 'detection', detail, triedStrategies: [] }],
    });
  }

  /**
   * Group by entity type, preserving document order within each group and
   * ordering the groups by first appearance.
   *
   * First appearance rather than count or severity: the user is looking at
   * their own message, and the order they wrote it in is the order they can
   * find things in. A severity ordering would be a second, invisible sort the
   * user has to reconcile against the text in front of them.
   */
  private group(entities: readonly AnalyzedEntity[]): ReviewGroup[] {
    const groups = new Map<string, { label: string; items: ReviewItem[] }>();
    for (const entity of entities) {
      let group = groups.get(entity.type);
      if (group === undefined) {
        group = { label: entity.label, items: [] };
        groups.set(entity.type, group);
      }
      group.items.push({
        id: entity.id,
        confidence: entity.confidence,
        explanation: entity.explanation,
        surrogate: entity.surrogate,
        reverted: this.session.isReverted(entity.id),
      });
    }
    return [...groups].map(([entityType, group]) => ({
      entityType,
      label: group.label,
      items: group.items,
    }));
  }

  private toggleRevert(id: string): void {
    this.session.toggleRevert(id);
    // Re-render from the analysis already computed rather than re-analysing:
    // the text has not changed, and re-running the pipeline to redraw a label
    // would be a detection pass the user's edit did not ask for.
    if (this.lastEntities.length === 0) return;
    // The SAME kind it was, not always `findings`. Toggling an item inside the
    // blocking review panel used to re-render it as the non-blocking findings
    // list, which removed Cancel and "Mask and send" - so the user could no
    // longer answer the question, and the send stayed suppressed with no way
    // to release it. Found by test.
    const kind = this.surfaceOwner === 'gate' ? 'review' : 'findings';
    this.surface.setState({
      kind,
      content: {
        groups: this.group(this.lastEntities),
        // The same score the analysis produced. Exposure measures what is AT
        // RISK in the message, and reverting an item does not reduce that -
        // it means the value will be sent in the clear, which is the opposite
        // of a reduction. Recomputing a smaller number on revert would tell
        // the user that keeping a value unmasked made them safer.
        exposureScore: this.lastExposure,
      },
    });
  }
}
