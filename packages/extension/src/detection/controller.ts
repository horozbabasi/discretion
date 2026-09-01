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

import type { NerRecognizer, SensitivityProfile } from '@privacyshield/core';
import { PROFILES } from '@privacyshield/core';

import type { ComposerHandle, SiteAdapter, SubmitIntent } from '../adapters/index.js';
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
import type { AnalyzedEntity, Analysis } from './analyze.js';
import { DetectionSession } from './session.js';
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
  readonly profile?: SensitivityProfile;
  /** Reported instead of thrown, so the caller decides what a failure means. */
  readonly onError: (error: unknown) => void;
}

export class DetectionController {
  private readonly options: ControllerOptions;
  private readonly surface: Surface;
  private readonly session = new DetectionSession();
  private readonly profile: SensitivityProfile;

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
   * The exact text the gate last wrote and released.
   *
   * Guards the recovery path. If a replay does not take - the site ignored the
   * synthetic event, the button moved - the user presses send again, and
   * without this the gate would re-analyse text that is ALREADY masked and
   * mask the surrogates a second time, since a format-preserving surrogate is
   * by construction a valid identifier.
   */
  private lastReleasedText: string | null = null;
  private unsubscribeSubmit: (() => void) | null = null;
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
  private surfaceOwner: 'idle' | 'gate' = 'idle';

  constructor(options: ControllerOptions) {
    this.options = options;
    this.profile = options.profile ?? PROFILES.balanced;
    this.surface = new Surface(options.document, {
      onConfirm: () => this.resolveDecision(true),
      onCancel: () => this.resolveDecision(false),
      onToggleItem: (id) => this.toggleRevert(id),
      onAnchorLost: () => this.refresh(),
      onSurfaceLost: () => this.options.onError(new Error('the surface could not stay attached')),
    });
  }

  start(): void {
    this.surface.mount();
    this.unsubscribeSubmit = this.options.adapter.onSubmitIntent((intent) => {
      this.onSubmit(intent);
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
        this.lastEntities = [];
        this.lastExposure = 0;
        this.surface.setAnchor(node);
      }

      if (this.surfaceOwner !== 'gate') {
        this.surface.setState(this.stateForHealth(composer.ok ? composer.value : null));
      }
      if (composer.ok) this.scheduleAnalysis();
    } catch (error) {
      this.failClosed(error, 'The page could not be checked. This message has not been reviewed.');
    }
  }

  /** Clears everything a session may hold. SPEC: no plaintext survives. */
  destroy(): void {
    this.unsubscribeSubmit?.();
    this.unsubscribeSubmit = null;
    // A panel awaiting an answer must not be left with a promise nobody will
    // settle. Resolving it as NOT released is the only safe direction.
    this.resolveDecision(false);
    this.passThrough.disarm();
    this.surfaceOwner = 'idle';
    this.lastReleasedText = null;
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
    if (!binding.ok) {
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
    if (this.lastReleasedText !== null && text === this.lastReleasedText) {
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

    if (analysis.entities.length === 0) {
      this.release(replay);
      return;
    }

    this.lastEntities = analysis.entities;
    this.lastExposure = analysis.exposure.score;
    const approved = await this.askForReview(analysis);
    if (!approved) {
      // Cancelled. The composer is untouched and nothing was sent; the user is
      // back where they were, with their text intact.
      this.surface.setState({ kind: 'hidden' });
      return;
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

    this.lastReleasedText = plan.maskedText;
    this.release(replay);
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

  /** Opens the review panel and waits for the user. */
  private askForReview(analysis: Analysis): Promise<boolean> {
    this.resolveDecision(false);
    this.surface.setState({
      kind: 'review',
      content: {
        groups: this.group(analysis.entities),
        exposureScore: analysis.exposure.score,
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
      profile: this.profile,
      mode: this.session.mode,
      seed: this.session.seed,
      vault: this.session.vault,
    });
  }

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
    return surfaceStateFor(health, evidence);
  }

  private bindInput(node: HTMLElement | null): void {
    this.unbindInput?.();
    this.unbindInput = null;
    this.boundComposer = node;
    if (node === null) return;

    const onInput = (): void => {
      // The user has moved on from whatever the gate last said, so the
      // findings list may take the surface back.
      this.surfaceOwner = 'idle';
      this.scheduleAnalysis();
    };
    // Bound to the composer rather than the document: a document-wide listener
    // would re-run analysis for every input on the page, including the site's
    // own search box.
    node.addEventListener('input', onInput);
    this.unbindInput = () => node.removeEventListener('input', onInput);
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
    // A gate in progress, or a refusal standing, owns the surface. See
    // `surfaceOwner`.
    if (this.surfaceOwner === 'gate') return;

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
        this.surface.setState({ kind: 'hidden' });
        return;
      }

      const analysis = await analyzeText(text, {
        ner: this.options.ner,
        profile: this.profile,
        mode: this.session.mode,
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
          ? { kind: 'hidden' }
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
