/**
 * Quick Redact: the same detection pipeline, for text going anywhere.
 *
 * SPEC.md: "A universal redaction surface in the popup: paste any text →
 * masked version with one-tap copy; paste a reply back within the same popup
 * session → restored. Powered entirely by core and the vault ... Works for ANY
 * destination — email, Slack, tickets, forums, anywhere — with zero additional
 * host permissions."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT REFUSES RATHER THAN UNDER-MASKS, FOR THE SAME REASON THE SEND GATE DOES
 *
 * The obvious shortcut is to let Quick Redact run Stage 1 alone when the model
 * is unavailable: it is a utility, not a gate, so "some masking" looks better
 * than none. It is not. Under-masking here is worse than at the send gate,
 * because there is no review panel to catch it — the user copies the output
 * and pastes it into Slack believing it is clean. A PERSON name that Stage 2
 * would have caught goes out silently, with the extension's assurance behind
 * it.
 *
 * So this checks `missingStages` exactly as the send gate does, and reports a
 * refusal the UI shows in place of an output. That is the whole of the
 * fail-closed rule applied to a surface where the "send" is a clipboard.
 *
 * THE VAULT IS THE POPUP'S OWN, AND DIES WITH IT
 *
 * A popup is torn down when it closes — there is no persistence to arrange and
 * none to forbid. The mapping between a value and its surrogate lives in this
 * object and nowhere else, which is what makes "paste a reply back within the
 * same popup session" the exact boundary SPEC describes. The UI says so in
 * words, because a guarantee nobody is told about is not one they have.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NerRecognizer, SensitivityProfile, SubstitutionMode } from '@privacyshield/core';
import { restore, Vault } from '@privacyshield/core';

import { analyzeText } from '../detection/analyze.js';
import type { AnalyzedEntity } from '../detection/analyze.js';
import { applyMasking, missingStages } from '../detection/sendGate.js';

export type QuickResult =
  | {
      readonly ok: true;
      readonly maskedText: string;
      readonly applied: readonly AnalyzedEntity[];
      readonly exposure: number;
    }
  | { readonly ok: false; readonly reason: 'stages' | 'error'; readonly detail: string };

export interface QuickOptions {
  readonly ner: NerRecognizer | null;
  readonly profile: SensitivityProfile;
  readonly mode: SubstitutionMode;
}

/** One random seed per popup, so two popups produce different surrogates. */
function popupSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 1) & 0x7fffffff;
}

export class QuickRedactSession {
  /** Public only so the UI can say how many values it currently holds. */
  readonly vault = new Vault();
  private readonly seed = popupSeed();

  async mask(text: string, options: QuickOptions): Promise<QuickResult> {
    if (text.trim().length === 0) {
      return { ok: true, maskedText: '', applied: [], exposure: 0 };
    }

    let analysis;
    try {
      analysis = await analyzeText(text, {
        ner: options.ner,
        profile: options.profile,
        mode: options.mode,
        seed: this.seed,
        vault: this.vault,
      });
    } catch (error: unknown) {
      // THE NAME ONLY, NOT THE MESSAGE.
      //
      // The usual `${name}: ${message}` is safe for the errors core raises -
      // `DetectorError` deliberately keeps the cause off its own message - but
      // it is safe by that convention rather than by construction, and the
      // stack under this call includes the tokenizer and the ONNX runtime,
      // whose messages this project does not author. A library that quoted the
      // input in an error would put the user's text into a DOM node through
      // the failure path, which is the one path nobody looks at.
      //
      // The name alone still distinguishes the cases that matter
      // (OffscreenUnavailableError, DetectionTimeoutError, TypeError), and the
      // popup's copy carries the explanation.
      const detail = error instanceof Error ? error.name : 'unknown error';
      return { ok: false, reason: 'error', detail };
    }

    // The same check the send gate makes, for the same reason.
    const missing = missingStages(analysis.stagesRun);
    if (missing.length > 0) {
      return { ok: false, reason: 'stages', detail: missing.join(', ') };
    }

    // Nothing is reverted here: there is no review panel, and the user's
    // choice is expressed by editing the output rather than by a toggle.
    const plan = applyMasking(text, analysis.entities, () => false);
    return {
      ok: true,
      maskedText: plan.maskedText,
      applied: plan.applied,
      exposure: analysis.exposure.score,
    };
  }

  /**
   * Puts the real values back into a reply.
   *
   * Only works for surrogates this popup issued, which is the point: the vault
   * is the only thing that maps one back, and it exists for as long as the
   * popup does.
   */
  restore(text: string): { readonly text: string; readonly count: number } {
    const result = restore(text, this.vault);
    return { text: result.restoredText, count: result.restoredCount };
  }
}
