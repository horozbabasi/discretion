/**
 * The popup.
 *
 * SPEC.md: "Popup: per-site toggle, session counts by type, adapter health,
 * sensitivity profile switcher, the session exposure aggregate, Quick Redact,
 * and Local Insights."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT ASKS THE TAB WHO IT IS RATHER THAN READING THE URL
 *
 * The obvious way to show per-site status is `chrome.tabs.query` and look at
 * `tab.url`. That needs the `tabs` permission, which grants the URL of every
 * tab in every window — a browsing history, for a status line.
 *
 * So the popup sends one message to the active tab and lets whoever is running
 * there answer. A content script replies with its own site id; a site with no
 * content script does not reply at all, and that silence IS the "PrivacyShield
 * does not run on this site" state. `tabs.query` is still used, but only for
 * the tab ID, which needs no permission and carries nothing.
 *
 * PERMISSIONS.md refuses to widen permissions for anything the extension can
 * find out by asking.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityFamily } from '@privacyshield/core';
import { PROFILES } from '@privacyshield/core';

import { PortNerRecognizer } from '../detection/portRecognizer.js';
import { entityLabel, isRtl, plural, t, uiLocale } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import type { PopupStatusReply } from '../messages.js';
import {
  loadInsights,
  resetInsights,
  viewOf,
} from '../storage/insights.js';
import type { MonthCounts } from '../storage/insights.js';
import type { Profile, Settings } from '../storage/settings.js';
import { loadSettings, saveSettings, setSiteEnabled } from '../storage/settings.js';
import { append, byId, clear, el } from './dom.js';
import { QuickRedactSession } from './quickRedact.js';

/** Above this, the exposure meter reads as a warning rather than a level. */
const HIGH_EXPOSURE = 60;

/** Families in the order Insights lists them: most sensitive first. */
const FAMILY_ORDER: readonly EntityFamily[] = [
  'secret',
  'financial',
  'identity',
  'health',
  'document',
  'contact',
  'person',
  'location',
  'network',
  'other',
];

const FAMILY_KEY: Readonly<Record<EntityFamily, MessageKey>> = {
  contact: 'family.contact',
  financial: 'family.financial',
  identity: 'family.identity',
  document: 'family.document',
  health: 'family.health',
  secret: 'family.secret',
  network: 'family.network',
  location: 'family.location',
  person: 'family.person',
  other: 'family.other',
};

/** Least to most sensitive, which is the order the switcher offers them in. */
const PROFILE_NAMES: readonly Profile[] = ['minimal', 'balanced', 'strict'];

const PROFILE_KEY: Readonly<Record<Profile, MessageKey>> = {
  minimal: 'popup.profile.minimal',
  balanced: 'popup.profile.balanced',
  strict: 'popup.profile.strict',
};

/** What the popup knows about the tab, once it has asked. */
type TabStatus =
  | { readonly kind: 'supported'; readonly reply: PopupStatusReply }
  | { readonly kind: 'unsupported' };

/**
 * Asks the active tab about itself.
 *
 * A tab with no content script rejects `sendMessage` with "Receiving end does
 * not exist", which is not an error condition — it is the answer. Treating it
 * as one is what lets the popup say "does not run here" instead of showing a
 * spinner forever.
 */
async function askTab(): Promise<TabStatus> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return { kind: 'unsupported' };
    const reply: unknown = await chrome.tabs.sendMessage(tab.id, { kind: 'popup-status' });
    if (typeof reply !== 'object' || reply === null || !('siteId' in reply)) {
      return { kind: 'unsupported' };
    }
    return { kind: 'supported', reply: reply as PopupStatusReply };
  } catch {
    return { kind: 'unsupported' };
  }
}

/** A 0-100 reading, drawn as a scale with the number always printed beside it. */
function meter(nameKey: MessageKey, value: number | null): HTMLElement {
  const row = el('div', 'meter-row');
  const name = el('span', 'meter-name', t(nameKey));
  const track = el('div', 'meter');
  const fill = el('i');

  const score = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  fill.style.width = `${String(score)}%`;
  if (score >= HIGH_EXPOSURE) track.dataset['band'] = 'high';
  track.append(fill);

  // role=meter is the correct role for a static reading; progressbar would
  // claim this is a task advancing towards completion.
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(score));
  track.setAttribute('aria-label', `${t(nameKey)}: ${t('panel.exposure', score)}`);

  const printed = el('span', 'meter-value num', value === null ? '—' : String(score));
  // The bar is decoration once the value is announced; announcing both would
  // read the number twice.
  track.setAttribute('aria-hidden', 'false');
  printed.setAttribute('aria-hidden', 'true');

  return append(row, name, track, printed);
}

/** A list of name/count rows, optionally with a proportional bar. */
function countRows(
  entries: readonly { readonly name: string; readonly count: number }[],
  withBars: boolean,
): HTMLElement {
  const list = el('ul', 'rows');
  const max = entries.reduce((n, entry) => Math.max(n, entry.count), 0);
  for (const entry of entries) {
    const row = el('li', 'row');
    append(row, el('span', '', entry.name), el('span', 'count num', String(entry.count)));
    if (withBars && max > 0) {
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${String(Math.round((entry.count / max) * 100))}%`;
      // The count is printed above it; the bar restates the same number and
      // must not be announced a second time.
      bar.setAttribute('aria-hidden', 'true');
      append(row, append(bar, fill));
    }
    list.append(row);
  }
  return list;
}

function familyRows(counts: MonthCounts): { readonly name: string; readonly count: number }[] {
  return FAMILY_ORDER.filter((family) => (counts[family] ?? 0) > 0).map((family) => ({
    name: t(FAMILY_KEY[family]),
    count: counts[family] ?? 0,
  }));
}

class Popup {
  private settings: Settings | null = null;
  private status: TabStatus = { kind: 'unsupported' };
  private readonly quick = new QuickRedactSession();
  private readonly recognizer = new PortNerRecognizer('popup-ner');
  private readonly panels = {
    status: byId('panel-status'),
    quick: byId('panel-quick'),
    insights: byId('panel-insights'),
  };

  async start(): Promise<void> {
    document.documentElement.lang = uiLocale();
    document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
    byId('mark').textContent = t('popup.title');

    this.buildTabs();
    // Both are asked for at once: neither depends on the other, and the popup
    // has a few hundred milliseconds before it looks slow.
    [this.settings, this.status] = await Promise.all([loadSettings(), askTab()]);
    this.renderHeader();
    this.renderStatus();
    this.renderQuick();
    void this.renderInsights();
  }

  /**
   * A real tablist: roving tabindex, arrow keys, Home and End.
   *
   * Buttons alone would be reachable but would not tell a screen reader that
   * these three are alternatives to one another, and Tab would walk through
   * every one of them before reaching the panel.
   */
  private buildTabs(): void {
    const bar = byId('tabs');
    const tabs: { key: MessageKey; panel: HTMLElement; id: string }[] = [
      { key: 'popup.tab.status', panel: this.panels.status, id: 'status' },
      { key: 'popup.tab.quickRedact', panel: this.panels.quick, id: 'quick' },
      { key: 'popup.tab.insights', panel: this.panels.insights, id: 'insights' },
    ];

    const buttons = tabs.map((tab, index) => {
      const label = t(tab.key);
      const button = el('button', 'tab', label);
      button.type = 'button';
      button.id = `tab-${tab.id}`;
      button.dataset['label'] = label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', tab.panel.id);
      tab.panel.setAttribute('aria-labelledby', button.id);
      button.setAttribute('aria-selected', String(index === 0));
      button.tabIndex = index === 0 ? 0 : -1;
      bar.append(button);
      return button;
    });

    const select = (index: number): void => {
      buttons.forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === index));
        button.tabIndex = i === index ? 0 : -1;
        const panel = tabs[i]?.panel;
        if (panel !== undefined) panel.hidden = i !== index;
      });
      buttons[index]?.focus();
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        select(index);
      });
      button.addEventListener('keydown', (event) => {
        const step =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        let next = -1;
        if (step !== 0) next = (index + step + buttons.length) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        if (next < 0) return;
        event.preventDefault();
        select(next);
      });
    });
  }

  private renderHeader(): void {
    const badge = byId('state');
    if (this.status.kind === 'unsupported') {
      badge.dataset['state'] = 'off';
      badge.textContent = t('popup.status.unsupported');
      return;
    }
    const { enabled, health } = this.status.reply;
    if (!enabled) {
      badge.dataset['state'] = 'off';
      badge.textContent = t('popup.status.unprotected');
      return;
    }
    const degraded = health !== null && !health.ok;
    badge.dataset['state'] = degraded ? 'degraded' : 'on';
    badge.textContent = degraded ? t('popup.health.degraded') : t('popup.status.protected');
  }

  private renderStatus(): void {
    const panel = this.panels.status;
    clear(panel);

    if (this.status.kind === 'unsupported') {
      // The badge already says the extension does not run here. Repeating it
      // wastes the one panel that could tell the user what they CAN do -
      // Quick Redact works on this page's text like it works on any other,
      // which is the whole reason it exists.
      append(
        panel,
        el('p', 'label', t('quick.heading')),
        el('p', 'note', t('quick.explain')),
      );
      return;
    }

    const reply = this.status.reply;
    const settings = this.settings ?? null;

    // ── the per-site toggle ──
    const toggleSection = el('div', 'section');
    const toggleRow = el('div', 'toggle');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'site-enabled';
    checkbox.checked = reply.enabled;
    const label = el('label', '', t('popup.status.enabledHere'));
    label.htmlFor = checkbox.id;
    checkbox.setAttribute('aria-label', t('popup.status.toggleAria'));
    checkbox.addEventListener('change', () => {
      void this.setEnabled(checkbox.checked);
    });
    append(toggleRow, label, checkbox);
    append(toggleSection, toggleRow, el('div', 'site', reply.siteId));

    // ── adapter health ──
    if (reply.health !== null && !reply.health.ok) {
      append(
        toggleSection,
        el('p', 'note', t('popup.health.degradedWhy')),
      );
    } else if (reply.enabled) {
      append(toggleSection, el('p', 'note', t('popup.health.ok')));
    }
    panel.append(toggleSection);

    // ── the sensitivity profile ──
    const profileSection = el('div', 'section');
    profileSection.append(el('p', 'label', t('popup.status.profile')));
    const select = el('select');
    select.id = 'profile';
    select.setAttribute('aria-label', t('popup.status.profile'));
    for (const profile of PROFILE_NAMES) {
      const option = el('option', '', t(PROFILE_KEY[profile]));
      option.value = profile;
      option.selected = settings?.profile === profile;
      select.append(option);
    }
    select.addEventListener('change', () => {
      void this.setProfile(select.value as Profile);
    });
    append(profileSection, select, el('p', 'note', t('popup.profile.hint')));
    panel.append(profileSection);

    // ── the session ──
    const sessionSection = el('div', 'section');
    sessionSection.append(el('p', 'label', t('popup.status.session')));
    if (reply.session.totalMasked === 0) {
      sessionSection.append(el('p', 'empty', t('popup.status.nothingYet')));
    } else {
      sessionSection.append(
        el('p', 'note', plural('quick.found', reply.session.totalMasked)),
      );
      sessionSection.append(
        countRows(
          reply.session.byType.map((entry) => ({
            name: entityLabel(entry.type),
            count: entry.count,
          })),
          false,
        ),
      );
      append(
        sessionSection,
        el('p', 'label', t('popup.status.sessionExposure')),
        meter('popup.status.peak', reply.session.peakExposure),
        meter('popup.status.mean', reply.session.meanExposure),
      );
    }
    panel.append(sessionSection);
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    if (this.status.kind !== 'supported') return;
    this.settings = await setSiteEnabled(this.status.reply.siteId, enabled, undefined);
    // Re-ask rather than assume: the tab applies the change itself, and the
    // popup should report what the tab now says rather than what it requested.
    this.status = await askTab();
    this.renderHeader();
    this.renderStatus();
  }

  private async setProfile(profile: Profile): Promise<void> {
    const current = this.settings ?? (await loadSettings());
    this.settings = await saveSettings({ ...current, profile });
  }

  // ── Quick Redact ──

  private renderQuick(): void {
    const panel = this.panels.quick;
    clear(panel);

    panel.append(el('p', 'label', t('quick.heading')));
    panel.append(el('p', 'note', t('quick.explain')));

    const input = el('textarea');
    // dir=auto, NOT the page's direction. The text in these boxes is the
    // user's, and it is routinely the opposite direction from the UI - an
    // Arabic speaker pasting an English support ticket. Inheriting `rtl`
    // pushes the trailing punctuation of a Latin sentence to the far left,
    // which is correct bidi for an RTL paragraph and wrong for this content.
    // `auto` lets the first strong character decide, per box.
    input.dir = 'auto';
    input.id = 'quick-input';
    input.placeholder = t('quick.placeholder');
    input.setAttribute('aria-label', t('quick.input.aria'));

    const output = el('textarea');
    output.dir = 'auto';
    output.id = 'quick-output';
    output.readOnly = true;
    output.setAttribute('aria-label', t('quick.output.aria'));

    const status = el('p', 'status');
    // Polite: this appears in response to a button the user pressed, and an
    // assertive region would interrupt a screen reader mid-word to say
    // something they are already waiting for.
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const maskButton = el('button', 'action primary', t('quick.action.mask'));
    maskButton.type = 'button';
    const restoreButton = el('button', 'action', t('quick.action.restore'));
    restoreButton.type = 'button';
    const copyButton = el('button', 'action', t('quick.action.copy'));
    copyButton.type = 'button';
    copyButton.disabled = true;

    const setStatus = (text: string, tone: 'info' | 'error' = 'info'): void => {
      status.textContent = text;
      status.dataset['tone'] = tone;
    };

    maskButton.addEventListener('click', () => {
      void (async () => {
        maskButton.disabled = true;
        try {
          const settings = this.settings ?? (await loadSettings());
          const result = await this.quick.mask(input.value, {
            ner: this.recognizer,
            // The stored setting is a NAME; the pipeline wants the profile
            // object it names.
            profile: PROFILES[settings.profile],
            mode: settings.mode,
          });
          if (!result.ok) {
            // Fail closed, visibly: no output at all, rather than a partly
            // masked string the user would paste somewhere trusting it.
            output.value = '';
            copyButton.disabled = true;
            setStatus(t('quick.unavailable'), 'error');
            return;
          }
          output.value = result.maskedText;
          copyButton.disabled = result.maskedText.length === 0;
          setStatus(
            result.applied.length === 0
              ? t('panel.paste.none')
              : plural('quick.found', result.applied.length),
          );
        } finally {
          maskButton.disabled = false;
        }
      })();
    });

    restoreButton.addEventListener('click', () => {
      const restored = this.quick.restore(input.value);
      output.value = restored.text;
      copyButton.disabled = restored.text.length === 0;
      setStatus(plural('quick.found', restored.count));
    });

    copyButton.addEventListener('click', () => {
      void navigator.clipboard.writeText(output.value).then(
        () => {
          setStatus(t('quick.copied'));
        },
        () => {
          setStatus(t('quick.unavailable'), 'error');
        },
      );
    });

    const actions = el('div', 'quick-actions');
    append(actions, maskButton, restoreButton, el('span', 'spacer'), copyButton);

    append(panel, input, actions, output, status, el('p', 'note', t('quick.memoryOnly')));
  }

  // ── Local Insights ──

  private async renderInsights(): Promise<void> {
    const panel = this.panels.insights;
    clear(panel);

    const view = viewOf(await loadInsights());
    panel.append(el('p', 'label', t('insights.heading')));

    if (view.empty) {
      panel.append(el('p', 'empty', t('insights.empty')));
      panel.append(el('p', 'note', t('insights.explain')));
      return;
    }

    const month = el('div', 'section');
    append(
      month,
      el('p', 'label', t('insights.thisMonth')),
      familyRows(view.thisMonth).length === 0
        ? el('p', 'empty', t('insights.empty'))
        : countRows(familyRows(view.thisMonth), true),
    );

    const all = el('div', 'section');
    append(all, el('p', 'label', t('insights.allTime')), countRows(familyRows(view.allTime), true));

    const reset = el('button', 'action', t('insights.reset'));
    reset.type = 'button';
    reset.addEventListener('click', () => {
      // A native confirm, deliberately: this is destructive and irreversible,
      // and a custom dialog here would be one more thing to get keyboard-
      // trapped wrong for no gain.
      if (!globalThis.confirm(t('insights.resetConfirm'))) return;
      void resetInsights().then(() => this.renderInsights());
    });

    const footer = el('div', 'section');
    append(footer, reset, el('p', 'note', t('insights.explain')));

    append(panel, month, all, footer);
  }
}

void new Popup().start();
