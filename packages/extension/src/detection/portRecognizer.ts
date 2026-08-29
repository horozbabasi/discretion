/**
 * Stage 2, reached across a process boundary.
 *
 * Implements `NerRecognizer`, so the pipeline neither knows nor cares that the
 * model is in another process. What crosses is one call per `recognize()` —
 * normalized text out, spans back — and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE ROUND TRIP PER ANALYSIS, NOT ONE PER CHUNK
 *
 * The obvious boundary is `TokenClassifier`: proxy `classify()` and leave the
 * engine here. It is the wrong one. The engine windows a document into ~400
 * character chunks, so a 2,000-character message is seven crossings instead of
 * one — and each crossing would carry the model's raw token predictions back,
 * which for a 400-character chunk is a hundred-odd {label, score, piece}
 * objects, far more data than the handful of spans they decode to.
 *
 * So the whole engine lives offscreen and the boundary is `recognize()`:
 * fewer crossings, and the larger payload never crosses at all. Alignment,
 * decoding and the per-call deadline stay with the model, where the work is.
 *
 * The measured cost either way is small — 1.2-2.0 ms round trip, near-flat to
 * 20,000 characters of payload — but "small" was a measurement, not a
 * guarantee, and seven of a thing beats one of it only if the thing is free.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO DEADLINES, DELIBERATELY
 *
 * The engine enforces its own budget over the inference. That deadline cannot
 * help here: if the offscreen document dies mid-call, or the port closes, or
 * the message is simply never answered, no timer on the far side will ever
 * fire. So this side imposes its own, strictly larger, and treats its expiry
 * exactly as it treats an error — by failing closed.
 *
 * The far side's deadline is the one that produces a useful diagnosis ("the
 * model was too slow"); this one only ever means "the model did not answer",
 * which is a different and worse condition.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NerRecognizer, NerSpan } from '@privacyshield/core';

import { NER_CHANNEL } from '../offscreen/protocol.js';
import type { NerRequest, NerRequestBody, NerResponse, OffscreenStatus } from '../offscreen/protocol.js';

/**
 * Outer deadline for one crossing, in milliseconds.
 *
 * Larger than the engine's own 2,000 ms budget so that a slow inference is
 * reported by the side that knows why it was slow. The gap covers cold model
 * load, which is 6,568 ms measured and only ever paid once per document.
 */
const CALL_TIMEOUT_MS = 20_000;

export class OffscreenUnavailableError extends Error {
  override readonly name = 'OffscreenUnavailableError';
}

interface Pending {
  readonly resolve: (response: NerResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class PortNerRecognizer implements NerRecognizer {
  readonly id: string;
  private port: chrome.runtime.Port | null = null;
  private provisioned: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private lastStatus: OffscreenStatus | null = null;

  constructor(id = 'offscreen-ner') {
    this.id = id;
  }

  /** The last status seen, for the diagnostic. Never triggers a crossing. */
  get status(): OffscreenStatus | null {
    return this.lastStatus;
  }

  /**
   * Asks the service worker to create the offscreen document, and WAITS.
   *
   * Owned here rather than left to the caller because the port cannot be
   * opened until the document exists: `chrome.runtime.connect` to an absent
   * receiver fails with "Could not establish connection. Receiving end does
   * not exist." The content script used to fire the request and connect
   * immediately, which is that race - found by measurement, on the first
   * benchmark run.
   *
   * The promise is cached, so concurrent calls provision once; it is dropped
   * on failure so a later call retries rather than inheriting the failure.
   */
  private ensureProvisioned(): Promise<void> {
    this.provisioned ??= (async () => {
      const reply: unknown = await chrome.runtime.sendMessage({ kind: 'ensure-offscreen' });
      if (typeof reply === 'object' && reply !== null && 'ok' in reply && reply.ok !== true) {
        const detail = 'error' in reply && typeof reply.error === 'string' ? reply.error : 'unknown';
        throw new OffscreenUnavailableError(`the offscreen document could not be created: ${detail}`);
      }
    })().catch((error: unknown) => {
      this.provisioned = null;
      throw error instanceof Error
        ? error
        : new OffscreenUnavailableError('provisioning failed');
    });
    return this.provisioned;
  }

  async warmup(): Promise<void> {
    const response = await this.call({ op: 'warmup' });
    if (!response.ok) throw new OffscreenUnavailableError(response.error);
  }

  /** Refreshes and returns the offscreen document's own account of itself. */
  async refreshStatus(): Promise<OffscreenStatus> {
    const response = await this.call({ op: 'status' });
    if (!response.ok || response.op !== 'status') {
      throw new OffscreenUnavailableError(response.ok ? 'unexpected reply' : response.error);
    }
    this.lastStatus = response.status;
    return response.status;
  }

  async recognize(text: string): Promise<NerSpan[]> {
    const response = await this.call({ op: 'recognize', text });
    if (!response.ok) throw new OffscreenUnavailableError(response.error);
    if (response.op !== 'recognize') throw new OffscreenUnavailableError('unexpected reply');
    return [...response.spans];
  }

  /**
   * Drops the connection. Any call in flight rejects rather than hanging.
   *
   * The port reference is CLEARED here rather than left to `onDisconnect`.
   * Chrome fires that listener on the OTHER end, not on the side that called
   * `disconnect()`, so relying on it left a dead port in place and the next
   * call failed with "Attempting to use a disconnected port object". Found by
   * the benchmark, which disconnects between samples to get a cold cache.
   */
  disconnect(): void {
    const port = this.port;
    this.port = null;
    this.provisioned = null;
    port?.disconnect();
    this.teardown(new OffscreenUnavailableError('the connection was closed'));
  }

  // ── internals ──────────────────────────────────────────────────────────

  private connect(): chrome.runtime.Port {
    if (this.port !== null) return this.port;
    // The channel NAME is the whole addressing scheme: exactly one context
    // accepts it, so the plaintext on this port reaches the offscreen document
    // and nothing else in the extension. See offscreen/protocol.ts.
    const port = chrome.runtime.connect({ name: NER_CHANNEL });
    port.onMessage.addListener((message: NerResponse) => this.settle(message));
    port.onDisconnect.addListener(() => {
      this.port = null;
      // The document may have gone, not just the port. Re-provisioning is
      // idempotent, so forgetting is cheaper than being wrong about it.
      this.provisioned = null;
      // Chrome reports the reason here and nowhere else; without reading it the
      // failure would surface as an unexplained timeout much later.
      const reason = chrome.runtime.lastError?.message ?? 'the offscreen document went away';
      this.teardown(new OffscreenUnavailableError(reason));
    });
    this.port = port;
    return port;
  }

  private settle(message: NerResponse): void {
    const waiter = this.pending.get(message.id);
    if (waiter === undefined) return;
    this.pending.delete(message.id);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  private teardown(error: Error): void {
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  private async call(request: NerRequestBody): Promise<NerResponse> {
    // The document must exist before the port can reach it, and the offscreen
    // document is not guaranteed to be resident - Chrome documents no lifetime
    // limit for this reason code today, but `TerminateDocument()` exists unused
    // and DevRel has said teardown checks are expected. So this runs on EVERY
    // call rather than once at startup: it is a cheap no-op when the document
    // is there, and the only thing that brings it back when it is not.
    await this.ensureProvisioned();
    return this.send(request);
  }

  private send(request: NerRequestBody): Promise<NerResponse> {
    const id = this.nextId++;
    return new Promise<NerResponse>((resolve, reject) => {
      let port: chrome.runtime.Port;
      try {
        port = this.connect();
      } catch (error) {
        reject(
          new OffscreenUnavailableError(
            error instanceof Error ? error.message : 'could not open the channel',
          ),
        );
        return;
      }

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new OffscreenUnavailableError(`no reply within ${String(CALL_TIMEOUT_MS)} ms`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });

      try {
        port.postMessage({ ...request, id } as NerRequest);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          new OffscreenUnavailableError(
            error instanceof Error ? error.message : 'could not post to the channel',
          ),
        );
      }
    });
  }
}
