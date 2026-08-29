/**
 * The content script ↔ offscreen document protocol.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A NAMED PORT, NOT `runtime.sendMessage`, AND THAT IS A PRIVACY DECISION
 *
 * `chrome.runtime.sendMessage` from a content script fires `onMessage` in
 * EVERY frame of the extension — Chrome documents it in exactly those words.
 * The payload on this channel is the user's composer text, unredacted, because
 * that is what the model has to see. Broadcasting it would deliver the
 * plaintext to an open popup and to the options page as well as to the
 * offscreen document. It never leaves the extension's own origin, so it is not
 * a leak; it is still the wrong shape for a tool whose entire premise is that
 * this text goes to as few places as possible.
 *
 * A named port narrows delivery to contexts that accept THIS channel, and the
 * rule below makes that exact:
 *
 *   EXACTLY ONE CONTEXT MAY ACCEPT `NER_CHANNEL`. Every other extension
 *   context must ignore it. Chrome specifies that when several listeners
 *   respond, the first response wins and the others are discarded silently —
 *   with no defined ordering across contexts. Under fail-closed, losing that
 *   race is a blocked send with no diagnosis, so the race must not exist.
 *
 * A test asserts that the service worker and every other entry point leave
 * this channel alone. The service worker therefore never receives composer
 * text, which is worth stating plainly: the only extension contexts that ever
 * hold it are the content script that read it and the offscreen document that
 * classifies it.
 *
 * MESSAGES ARE JSON, NOT STRUCTURED CLONE. Chrome serializes extension
 * messaging with JSON unless `message_serialization: "structured_clone"` is
 * declared (Chrome 148+). Every type here is JSON-representable on purpose:
 * no Map, no Set, no typed array, no undefined-valued property.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NerSpan } from '@privacyshield/core';

/** The one channel name the offscreen document accepts. */
export const NER_CHANNEL = 'privacyshield-ner';

/** Sent to the service worker to provision the offscreen document. */
export interface EnsureOffscreenMessage {
  readonly kind: 'ensure-offscreen';
}

export interface OffscreenStatus {
  readonly ready: boolean;
  /**
   * WASM thread count actually in force.
   *
   * Reported rather than assumed: onnxruntime-web silently clamps to one
   * thread when `crossOriginIsolated` is false, with no error. A system that
   * fails closed on correctness and then runs 4-8x slower without saying so
   * has failed open on its latency contract.
   */
  readonly threads: number;
  readonly crossOriginIsolated: boolean;
  readonly modelId: string | null;
  /** What onnxruntime-web RESOLVED, read back rather than assumed. */
  readonly wasmPaths: string | null;
  /** `simd` is a tri-state in the runtime's own types: boolean or a mode name. */
  readonly simd: string | null;
  readonly proxy: boolean | null;
  // NO `loadedRuntimeFiles` FIELD, and the absence is deliberate. Reading
  // `performance.getEntriesByType('resource')` here to report which
  // onnxruntime-web variant loaded returns an empty array every time:
  // onnxruntime-web fetches its .mjs and .wasm inside a Web Worker, which has
  // its own Resource Timing buffer that the document cannot see. A field that
  // can only ever report "nothing was fetched" is worse than no field - it
  // reads as evidence and is an artefact of where it was measured.
  //
  // The variant in force was established a different way, and by accident:
  // shipping only two variants failed with a request for
  // `ort-wasm-simd-threaded.asyncify.mjs`, which is what names it.
  readonly loadMs: number | null;
  /** Operator-facing. Never contains page text. */
  readonly error: string | null;
}

/**
 * A request without its correlation id.
 *
 * Named rather than written as `Omit<NerRequest, 'id'>`: Omit over a union
 * collapses it to the properties they share, so `text` would silently vanish
 * from the recognize case and the compiler would reject the only call that
 * matters.
 */
export type NerRequestBody =
  | { readonly op: 'status' }
  | { readonly op: 'warmup' }
  | { readonly op: 'recognize'; readonly text: string };

export type NerRequest = NerRequestBody & { readonly id: number };

export type NerResponse =
  | { readonly id: number; readonly ok: true; readonly op: 'status'; readonly status: OffscreenStatus }
  | { readonly id: number; readonly ok: true; readonly op: 'warmup' }
  | {
      readonly id: number;
      readonly ok: true;
      readonly op: 'recognize';
      readonly spans: readonly NerSpan[];
    }
  | {
      readonly id: number;
      readonly ok: false;
      /**
       * Error NAME and MESSAGE only, never the payload.
       *
       * A recognition error can carry the chunk it failed on, and a chunk is
       * composer text. This string reaches logs and the degraded panel.
       */
      readonly error: string;
      /** Set when the failure was the engine's own deadline. */
      readonly timedOut?: boolean;
    };
