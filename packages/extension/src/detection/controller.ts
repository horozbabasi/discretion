/**
 * What runs detection, and what it does with the answer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPEC.md's content-script flow, steps 1-5:
 *   1. Identify site, load adapter, run healthCheck, warm the NER worker
 *   2-4. (submit interception, masking, the send gate) - NOT here
 *   5. Show the review panel: detections grouped by type, each with
 *      calibrated confidence and explanation, each individually revertible
 *
 * This controller owns 1 and 5. It is READ-ONLY: it reads the composer, it
 * never writes to it, it never listens for a submit, and it blocks nothing.
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
 * FAIL-CLOSED, WITH NOTHING TO CLOSE YET
 *
 * SPEC: "Any detection error, timeout, or adapter failure blocks the send."
 * There is no send gate in this batch, so nothing here can block. What it can
 * do - and must - is refuse to look successful. A detection error puts the
 * surface into DEGRADED, which is the same state an adapter failure produces
 * and the state the gate will read when it exists. The one thing that must
 * never happen is an error resolving to an empty panel, because "found
 * nothing" and "could not look" are indistinguishable to a user and only one
 * of them is safe.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NerRecognizer, SensitivityProfile } from '@privacyshield/core';
import { PROFILES } from '@privacyshield/core';

import type { ComposerHandle, SiteAdapter } from '../adapters/index.js';
import { Surface } from '../ui/surface.js';
import type { ReviewGroup, ReviewItem, SurfaceState } from '../ui/surfaceState.js';
import {
  composerTemporarilyDisabled,
  sendControlNotExpected,
  surfaceStateFor,
} from '../ui/surfaceState.js';
import { analyzeText } from './analyze.js';
import type { AnalyzedEntity } from './analyze.js';
import { DetectionSession } from './session.js';

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

  constructor(options: ControllerOptions) {
    this.options = options;
    this.profile = options.profile ?? PROFILES.balanced;
    this.surface = new Surface(options.document, {
      // Neither exists yet: both belong to the send gate, and a button that
      // silently does nothing is worse than an absent one. The `findings`
      // state renders no Cancel and no "Mask and send" for exactly this
      // reason, so these are unreachable rather than inert.
      onConfirm: () => undefined,
      onCancel: () => undefined,
      onToggleItem: (id) => this.toggleRevert(id),
      onAnchorLost: () => this.refresh(),
      onSurfaceLost: () => this.options.onError(new Error('the surface could not stay attached')),
    });
  }

  start(): void {
    this.surface.mount();
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

      this.surface.setState(this.stateForHealth(composer.ok ? composer.value : null));
      if (composer.ok) this.scheduleAnalysis();
    } catch (error) {
      this.failClosed(error, 'The page could not be checked. This message has not been reviewed.');
    }
  }

  /** Clears everything a session may hold. SPEC: no plaintext survives. */
  destroy(): void {
    this.cancelDebounce();
    this.bindInput(null);
    this.session.clear();
    this.surface.destroy();
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

    const onInput = (): void => this.scheduleAnalysis();
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
    this.surface.setState({
      kind: 'findings',
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
