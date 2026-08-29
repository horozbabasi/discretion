/**
 * Service worker.
 *
 * Its whole job at this step is to make adapter health VISIBLE. SPEC.md: "On
 * failure the extension enters a visible degraded state, blocks sends, and
 * tells the user the site layout changed." The badge is the visible part; the
 * blocking part lives in the content script and arrives with detection.
 *
 * State is per-tab and in memory only. A service worker is evicted routinely,
 * which loses the badge state — acceptable, because the content script reports
 * health on a poll and the badge is restored within one interval. Persisting
 * it would mean writing per-site activity to storage, which is exactly the
 * browsing-history exposure PERMISSIONS.md refuses.
 */

import type { ExtensionMessage } from './messages.js';

/**
 * WORKERS, because onnxruntime-web runs its WASM in Web Workers.
 *
 * The reason field is purely declarative - Chrome validates that it is
 * non-empty and nothing else - but it is the only thing that selects the
 * lifetime enforcer, and AUDIO_PLAYBACK is the one value that would close this
 * document after 30 seconds of silence. Every other value, WORKERS included,
 * imposes no lifetime limit.
 */
const OFFSCREEN_REASON = 'WORKERS' as chrome.offscreen.Reason;
const OFFSCREEN_URL = 'offscreen.html';

/**
 * Provisioning is serialized through this promise.
 *
 * `createDocument` rejects with "Only a single offscreen document may be
 * created" if one already exists, and two content scripts asking at once - two
 * tabs on two of the three sites, which is ordinary - would race between the
 * hasDocument check and the create. Sharing the in-flight promise makes the
 * second caller wait for the first rather than trip over it.
 */
let provisioning: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  provisioning ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [OFFSCREEN_REASON],
      justification:
        'Runs the local NER model. A content script cannot compile WebAssembly under the host page CSP, and no text leaves the device.',
    })
    .catch((error: unknown) => {
      // A racing create that lost is not a failure: the document the winner
      // made is the one we wanted.
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('single offscreen document')) throw error;
    })
    .finally(() => {
      provisioning = null;
    });
  await provisioning;
}

const DEGRADED_BADGE = '!';
const DEGRADED_COLOUR = '#B4402A';

function setBadge(tabId: number, degraded: boolean): void {
  void chrome.action.setBadgeText({ tabId, text: degraded ? DEGRADED_BADGE : '' });
  if (degraded) {
    void chrome.action.setBadgeBackgroundColor({ tabId, color: DEGRADED_COLOUR });
    void chrome.action.setTitle({
      tabId,
      title: 'PrivacyShield: this site\'s layout changed and protection is unavailable. Sends are blocked.',
    });
  } else {
    void chrome.action.setTitle({ tabId, title: 'PrivacyShield' });
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, respond) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;

  if (message.kind === 'health') {
    setBadge(tabId, !message.ok);
    return;
  }
  if (message.kind === 'unsupported-site') {
    setBadge(tabId, false);
    return;
  }
  if (message.kind === 'ensure-offscreen') {
    // Content scripts cannot call chrome.offscreen.*, so provisioning has to
    // come through here. Nothing about the user's text does: that goes
    // straight to the offscreen document over its own named port, and this
    // worker never sees it.
    //
    // The reply is sent AFTER the document exists, not on receipt. Answering
    // early - or not answering at all, which is what returning undefined does -
    // lets the caller open its port against a receiver that is not there yet,
    // and Chrome reports that as "Could not establish connection. Receiving end
    // does not exist." Found by measurement: the first benchmark run failed
    // with exactly that, and the production path had the same race.
    ensureOffscreen().then(
      () => {
        respond({ ok: true });
      },
      (error: unknown) => {
        respond({ ok: false, error: error instanceof Error ? error.message : 'unknown' });
      },
    );
    return true;
  }
  if (message.kind === 'detection-error') {
    // A detection failure is a degraded page in exactly the sense the badge
    // means: this tab is not being checked. It is deliberately NOT a separate
    // badge state - two ways of saying "unprotected" would let a user learn
    // that one of them is the harmless one.
    setBadge(tabId, true);
  }
});
