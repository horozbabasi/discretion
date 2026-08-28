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

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;

  if (message.kind === 'health') {
    setBadge(tabId, !message.ok);
    return;
  }
  if (message.kind === 'unsupported-site') {
    setBadge(tabId, false);
  }
});
