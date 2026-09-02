/**
 * The options page.
 *
 * SPEC.md: "Options: per-entity toggles, sensitivity profile, surrogate vs
 * token mode, allowlist, denylist, custom regex rules with live tester,
 * default phone region, settings export/import, a plain-language explanation
 * of what the extension does and does not protect against."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT SAVES AS YOU GO, AND THERE IS NO SAVE BUTTON
 *
 * A settings page for a protection tool has one failure mode worse than a
 * surprise write: a change that LOOKS applied and is not. Someone switches a
 * type off, closes the tab, and the extension carries on masking it — or
 * worse, switches one ON, closes the tab, and it never starts. A Save button
 * makes that outcome one missed click away, every time.
 *
 * So every control writes on change (text areas on blur, so a half-typed
 * regex is never stored), and the footer says when the last write landed. The
 * content script listens on `chrome.storage.onChanged`, so a change reaches an
 * open ChatGPT tab without a reload.
 *
 * WHAT IS SHOWN HERE IS WHAT THE ENGINE WOULD RUN. A pattern that does not
 * compile is refused at the input rather than stored disabled, and the live
 * tester runs the real `RegExp` against the real text — so the page cannot
 * promise a rule the pipeline would ignore.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityFamily, EntityType } from '@privacyshield/core';
import { detectableEntityTypes, familyOf } from '@privacyshield/core';

import { entityLabel, isRtl, plural, t, uiLocale } from '../i18n/index.js';
import type { MessageKey } from '../i18n/index.js';
import type { CustomRule, Profile, Settings } from '../storage/settings.js';
import {
  DEFAULT_SETTINGS,
  compilesAsRegex,
  loadSettings,
  parseSettings,
  saveSettings,
} from '../storage/settings.js';
import { append, byId, clear, el } from '../popup/dom.js';

/**
 * Which entity types get a toggle.
 *
 * MOVED TO CORE AT M12. This page used to carry its own
 * `Record<EntityType, true>` plus a hand-maintained `NOT_YET_DETECTED` set.
 * Both facts - which types exist, and which of them anything can actually
 * produce - belong to the detection engine, not to a settings page, and the
 * copy here could go stale the moment a detector was added.
 *
 * `detectableEntityTypes()` is DERIVED from the detector registry and Stage
 * 2's output types, so a type appears here the moment something can produce
 * it and disappears when nothing can. That is what M11's `DATE_OF_BIRTH`
 * finding was about: the page offered a toggle for a type with no detector,
 * which is a control that does nothing in either position.
 *
 * `verify-options.py` still pins the rendered count, so a list that silently
 * SHRINKS is caught too - a type nobody can switch off looks identical to one
 * nobody wants to.
 */

const FAMILY_ORDER: readonly EntityFamily[] = [
  'secret', 'financial', 'identity', 'health', 'document',
  'contact', 'person', 'location', 'network', 'other',
];

const FAMILY_KEY: Readonly<Record<EntityFamily, MessageKey>> = {
  contact: 'family.contact', financial: 'family.financial',
  identity: 'family.identity', document: 'family.document',
  health: 'family.health', secret: 'family.secret', network: 'family.network',
  location: 'family.location', person: 'family.person', other: 'family.other',
};

const PROFILE_NAMES: readonly Profile[] = ['minimal', 'balanced', 'strict'];
const PROFILE_KEY: Readonly<Record<Profile, MessageKey>> = {
  minimal: 'popup.profile.minimal',
  balanced: 'popup.profile.balanced',
  strict: 'popup.profile.strict',
};

/**
 * Regions offered for the phone default.
 *
 * A curated list, not all 249: this is a dropdown someone scrolls, and the
 * names come from `Intl.DisplayNames` in the UI language so it is localised
 * without another 249 catalogue entries. A region not listed can still be
 * stored — `parseSettings` accepts any two letters — it simply is not offered.
 */
const REGIONS = [
  'AU', 'BR', 'CA', 'CH', 'CN', 'DE', 'EG', 'ES', 'FR', 'GB', 'ID', 'IE',
  'IN', 'IT', 'JP', 'KR', 'MX', 'NG', 'NL', 'NZ', 'PL', 'PT', 'RU', 'SA',
  'SE', 'SG', 'TR', 'UA', 'US', 'ZA',
] as const;

/** A random-enough id for a new rule. No meaning, just uniqueness. */
function newRuleId(): string {
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  return `r${buffer[0]!.toString(36)}${buffer[1]!.toString(36)}`;
}

class OptionsPage {
  private settings: Settings = DEFAULT_SETTINGS;
  private readonly main = byId('main');
  private status: HTMLElement | null = null;

  async start(): Promise<void> {
    document.documentElement.lang = uiLocale();
    document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
    byId('title').textContent = t('options.title');
    byId('intro').textContent = t('options.intro');
    this.settings = await loadSettings();
    this.render();
  }

  /** Writes, then says so. Every control funnels through here. */
  private async commit(patch: Partial<Settings>): Promise<void> {
    this.settings = await saveSettings({ ...this.settings, ...patch });
    if (this.status !== null) this.status.textContent = t('options.saved');
  }

  private render(): void {
    clear(this.main);
    append(
      this.main,
      this.profileSection(),
      this.modeSection(),
      this.typesSection(),
      this.listsSection(),
      this.rulesSection(),
      this.regionSection(),
      this.dataSection(),
      this.aboutSection(),
      this.statusBar(),
    );
  }

  private section(titleKey: MessageKey, hintKey?: MessageKey): HTMLElement {
    const section = el('div', 'section');
    section.append(el('p', 'label', t(titleKey)));
    if (hintKey !== undefined) section.append(el('p', 'note', t(hintKey)));
    return section;
  }

  /**
   * A radio group inside a fieldset with a legend.
   *
   * The legend is what a screen reader announces before each option, so
   * "Balanced" is heard as "Sensitivity, Balanced" rather than as a loose word
   * among forty others on the page.
   */
  private radioGroup<T extends string>(
    name: string,
    legend: string,
    values: readonly T[],
    labelOfValue: (value: T) => string,
    current: T,
    onPick: (value: T) => void,
  ): HTMLElement {
    const fieldset = el('fieldset');
    const legendNode = el('legend', 'label', legend);
    fieldset.append(legendNode);
    const group = el('div', 'choices');

    for (const value of values) {
      const choice = el('label', 'choice');
      choice.dataset['selected'] = String(value === current);
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === current;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        for (const sibling of group.querySelectorAll('.choice')) {
          (sibling as HTMLElement).dataset['selected'] = 'false';
        }
        choice.dataset['selected'] = 'true';
        onPick(value);
      });
      append(choice, input, el('span', '', labelOfValue(value)));
      group.append(choice);
    }
    fieldset.append(group);
    return fieldset;
  }

  private profileSection(): HTMLElement {
    const section = el('div', 'section');
    section.append(
      this.radioGroup(
        'profile',
        t('popup.status.profile'),
        PROFILE_NAMES,
        (profile) => t(PROFILE_KEY[profile]),
        this.settings.profile,
        (profile) => void this.commit({ profile }),
      ),
      el('p', 'note', t('popup.profile.hint')),
    );
    return section;
  }

  private modeSection(): HTMLElement {
    const section = el('div', 'section');
    const modes = ['surrogate', 'token'] as const;
    section.append(
      this.radioGroup(
        'mode',
        t('options.section.substitution'),
        modes,
        (mode) => t(mode === 'surrogate' ? 'options.mode.surrogate' : 'options.mode.token'),
        this.settings.mode,
        (mode) => void this.commit({ mode }),
      ),
    );
    return section;
  }

  private typesSection(): HTMLElement {
    const section = this.section('options.section.types', 'options.types.hint');
    const grid = el('div', 'types');

    const byFamily = new Map<EntityFamily, EntityType[]>();
    for (const type of detectableEntityTypes()) {
      const family = familyOf(type);
      const list = byFamily.get(family) ?? [];
      list.push(type);
      byFamily.set(family, list);
    }

    for (const family of FAMILY_ORDER) {
      const types = byFamily.get(family);
      if (types === undefined || types.length === 0) continue;
      grid.append(el('h2', 'family-head', t(FAMILY_KEY[family])));
      for (const type of types.sort((a, b) => entityLabel(a).localeCompare(entityLabel(b)))) {
        const row = el('label', 'type');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = !this.settings.disabledTypes.includes(type);
        box.addEventListener('change', () => {
          const without = this.settings.disabledTypes.filter((id) => id !== type);
          void this.commit({
            disabledTypes: box.checked ? without : [...without, type],
          });
        });
        append(row, box, el('span', '', entityLabel(type)));
        grid.append(row);
      }
    }
    section.append(grid);
    return section;
  }

  /** A textarea whose lines become a list, written on blur. */
  private listBox(
    labelKey: MessageKey,
    values: readonly string[],
    onCommit: (lines: string[]) => void,
  ): HTMLElement {
    const wrap = el('div');
    const box = el('textarea');
    box.dir = 'auto';
    box.value = values.join('\n');
    box.id = `list-${labelKey}`;
    const label = el('label', 'label', t(labelKey));
    label.htmlFor = box.id;
    // ON BLUR, not on input: a list written on every keystroke stores every
    // prefix of what someone is typing, which for a denylist is a series of
    // partial values on disk.
    box.addEventListener('blur', () => {
      onCommit(box.value.split('\n'));
    });
    return append(wrap, label, box);
  }

  private listsSection(): HTMLElement {
    const section = this.section('options.section.lists', 'options.lists.hint');
    const pair = el('div', 'pair');
    append(
      pair,
      this.listBox('options.allowlist', this.settings.allowlist, (allowlist) => {
        void this.commit({ allowlist });
      }),
      this.listBox('options.denylist', this.settings.denylist, (denylist) => {
        void this.commit({ denylist });
      }),
    );
    section.append(pair);
    return section;
  }

  private rulesSection(): HTMLElement {
    const section = this.section('options.section.rules');
    const list = el('div');

    const redraw = (): void => {
      clear(list);
      if (this.settings.customRules.length === 0) {
        list.append(el('p', 'empty', t('options.rules.empty')));
      }
      for (const rule of this.settings.customRules) {
        list.append(this.ruleRow(rule, redraw));
      }
    };
    redraw();

    // ── add ──
    const addRow = el('div', 'rule');
    const name = el('input');
    name.type = 'text';
    name.setAttribute('aria-label', t('options.rules.name'));
    name.placeholder = t('options.rules.name');
    const pattern = el('input');
    pattern.type = 'text';
    pattern.className = 'mono';
    pattern.setAttribute('aria-label', t('options.rules.pattern'));
    pattern.placeholder = t('options.rules.pattern');
    const add = el('button', 'action primary', t('options.rules.add'));
    add.type = 'button';
    const error = el('span', 'status');
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');

    const validate = (): boolean => {
      const valid = pattern.value.length === 0 || compilesAsRegex(pattern.value);
      pattern.setAttribute('aria-invalid', String(!valid));
      error.textContent = valid ? '' : t('options.rules.invalid');
      error.dataset['tone'] = valid ? 'info' : 'error';
      return valid && pattern.value.length > 0;
    };
    pattern.addEventListener('input', () => {
      validate();
    });
    add.addEventListener('click', () => {
      if (!validate()) return;
      const rule: CustomRule = {
        id: newRuleId(),
        label: name.value.trim().length > 0 ? name.value.trim() : pattern.value,
        pattern: pattern.value,
        enabled: true,
      };
      void this.commit({ customRules: [...this.settings.customRules, rule] }).then(() => {
        name.value = '';
        pattern.value = '';
        redraw();
      });
    });
    append(addRow, name, pattern, add, error);

    append(section, list, addRow, this.tester());
    return section;
  }

  private ruleRow(rule: CustomRule, redraw: () => void): HTMLElement {
    const row = el('div', 'rule');
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = rule.enabled;
    toggle.setAttribute('aria-label', rule.label);
    toggle.addEventListener('change', () => {
      void this.commit({
        customRules: this.settings.customRules.map((r) =>
          r.id === rule.id ? { ...r, enabled: toggle.checked } : r,
        ),
      });
    });

    const remove = el('button', 'action', t('options.rules.remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      void this.commit({
        customRules: this.settings.customRules.filter((r) => r.id !== rule.id),
      }).then(redraw);
    });

    return append(
      row,
      toggle,
      el('span', '', rule.label),
      el('code', 'mono', rule.pattern),
      remove,
    );
  }

  /**
   * The live tester.
   *
   * Runs the user's real patterns against text they type here, and counts
   * matches. Nothing typed into it is stored — the page says so, because a box
   * on a settings screen looks exactly like a setting.
   */
  private tester(): HTMLElement {
    const wrap = el('div', 'section');
    const box = el('textarea');
    box.dir = 'auto';
    box.id = 'rule-tester';
    const label = el('label', 'label', t('options.rules.tryIt'));
    label.htmlFor = box.id;
    const result = el('p', 'status');
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');

    box.addEventListener('input', () => {
      let matches = 0;
      for (const rule of this.settings.customRules) {
        if (!rule.enabled) continue;
        try {
          // `g` so every occurrence counts, not just the first; `u` to match
          // what `compilesAsRegex` accepted.
          const found = box.value.match(new RegExp(rule.pattern, 'gu'));
          matches += found?.length ?? 0;
        } catch {
          // A pattern that compiled at entry and not now cannot happen, but a
          // throw here would take the whole page down for a typo.
        }
      }
      result.textContent = plural('options.rules.matches', matches);
    });

    return append(wrap, label, box, result, el('p', 'note', t('options.rules.notStored')));
  }

  private regionSection(): HTMLElement {
    const section = this.section('options.section.region', 'options.region.hint');
    const select = el('select');
    select.id = 'region';
    select.setAttribute('aria-label', t('options.section.region'));

    // Localised country names for free, in the UI language.
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([uiLocale()], { type: 'region' });
    } catch {
      names = null;
    }
    const sorted = [...REGIONS].sort((a, b) =>
      (names?.of(a) ?? a).localeCompare(names?.of(b) ?? b),
    );
    for (const region of sorted) {
      const option = el('option', '', `${names?.of(region) ?? region} (${region})`);
      option.value = region;
      option.selected = region === this.settings.phoneRegion;
      select.append(option);
    }
    select.addEventListener('change', () => {
      void this.commit({ phoneRegion: select.value });
    });
    section.append(select);
    return section;
  }

  private dataSection(): HTMLElement {
    const section = this.section('options.section.data', 'options.exportWarn');
    const row = el('div', 'quick-actions');

    const save = el('button', 'action', t('options.export'));
    save.type = 'button';
    save.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.settings, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = 'privacyshield-settings.json';
      link.click();
      URL.revokeObjectURL(url);
    });

    const file = el('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.id = 'import-file';
    file.setAttribute('aria-label', t('options.import'));
    const outcome = el('p', 'status');
    outcome.setAttribute('role', 'status');
    outcome.setAttribute('aria-live', 'polite');

    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      if (chosen === undefined) return;
      void chosen
        .text()
        .then((text) => {
          // PARSED, not trusted. This file came from outside the extension and
          // may be anything; `parseSettings` discards what it cannot
          // recognise and substitutes the protective default, so an import
          // cannot turn detection off by accident or on purpose.
          const imported = parseSettings(JSON.parse(text));
          return this.commit(imported);
        })
        .then(() => {
          outcome.dataset['tone'] = 'info';
          outcome.textContent = t('options.imported');
          this.render();
        })
        .catch(() => {
          outcome.dataset['tone'] = 'error';
          outcome.textContent = t('options.importFailed');
        });
    });

    // No separate <label> beside it: the native control already renders its
    // own button, and a second visible word for one action reads as two
    // controls. The accessible name comes from `aria-label` above.
    append(row, save, file);
    append(section, row, outcome);
    return section;
  }

  /** The most important copy on the page, so it is set as prose. */
  private aboutSection(): HTMLElement {
    const section = this.section('options.section.about');
    const about = el('div', 'about');
    about.append(el('p', '', t('options.about.does')));
    const list = el('ul');
    for (const key of [
      'options.about.notFiles',
      'options.about.notElsewhere',
      'options.about.notTyping',
      'options.about.notPerfect',
    ] as const) {
      list.append(el('li', '', t(key)));
    }
    about.append(list);
    section.append(about);
    return section;
  }

  private statusBar(): HTMLElement {
    const bar = el('div', 'sticky-save');
    this.status = el('span', 'status');
    // Polite and atomic: it says one short thing after an action the user
    // took, and interrupting a screen reader to say "Saved" is worse than
    // waiting for the next pause.
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-atomic', 'true');
    bar.append(this.status);
    return bar;
  }
}

void new OptionsPage().start();
