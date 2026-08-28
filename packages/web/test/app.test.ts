// @vitest-environment jsdom
/**
 * Interaction tests for the core playground flows: type text and see
 * detection, toggle masking modes, load an example, and the fail-closed
 * error state. The pipeline is the REAL core (via the workspace aliases);
 * only the fail-closed test injects a throwing stand-in.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generate } from '@privacyshield/core';
import { createApp } from '../src/app.js';
import type { App } from '../src/app.js';

const SEED = 42;

function mountApp(options: Parameters<typeof createApp>[1] = {}): { app: App; mount: HTMLElement } {
  const mount = document.createElement('div');
  document.body.append(mount);
  const app = createApp(mount, { seed: SEED, ...options });
  return { app, mount };
}

function textareaOf(mount: HTMLElement): HTMLTextAreaElement {
  return mount.querySelector('textarea')!;
}

function typeText(mount: HTMLElement, app: App, text: string): void {
  const textarea = textareaOf(mount);
  textarea.value = text;
  textarea.dispatchEvent(new Event('input'));
  app.flush();
}

const SAMPLE = `Please wire to ${generate.generateValidIban(21)} and mail ${generate.generateValidEmail(22)} today.`;

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('playground app', () => {
  it('detects while typing: highlights, masked output, and summary counts', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);

    const marks = mount.querySelectorAll('.editor-backdrop mark');
    expect(marks.length).toBeGreaterThanOrEqual(2);

    const output = mount.querySelector('.output-pane')!;
    expect(output.textContent).not.toContain(generate.generateValidIban(21));
    expect(output.textContent).toContain('Please wire to');

    const summary = mount.querySelector('.summary-body')!;
    expect(summary.textContent).toContain('values masked');
    expect(summary.textContent).toContain('IBAN');
    expect(summary.textContent).toContain('Email');
  });

  it('debounces live detection until the pause', () => {
    vi.useFakeTimers();
    const { mount } = mountApp();
    const textarea = textareaOf(mount);
    textarea.value = SAMPLE;
    textarea.dispatchEvent(new Event('input'));

    expect(mount.querySelectorAll('.editor-backdrop mark')).toHaveLength(0);
    vi.advanceTimersByTime(250);
    expect(mount.querySelectorAll('.editor-backdrop mark').length).toBeGreaterThanOrEqual(2);
  });

  it('the backdrop mirrors the exact text (no HTML interpretation)', () => {
    const { app, mount } = mountApp();
    const sneaky = `<img src=x onerror=alert(1)> mail ${generate.generateValidEmail(23)}`;
    typeText(mount, app, sneaky);

    const backdrop = mount.querySelector('.editor-backdrop')!;
    expect(backdrop.querySelector('img')).toBeNull();
    // ZWSP sentinel aside, the backdrop text is the typed text verbatim.
    expect(backdrop.textContent!.replace(/\u200B$/, '')).toBe(sneaky);
  });

  it('toggles between surrogate and token mode', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);

    const output = mount.querySelector('.output-pane')!;
    expect(output.textContent).not.toMatch(/\[IBAN_\d+\]/);

    const tokenBtn = [...mount.querySelectorAll('button.mode-btn')].find(
      (b) => b.textContent === 'Tokens',
    )!;
    tokenBtn.dispatchEvent(new Event('click'));
    expect(output.textContent).toMatch(/\[IBAN_\d+\]/);
    expect(tokenBtn.getAttribute('aria-pressed')).toBe('true');

    const surrogateBtn = [...mount.querySelectorAll('button.mode-btn')].find(
      (b) => b.textContent === 'Surrogates',
    )!;
    surrogateBtn.dispatchEvent(new Event('click'));
    expect(output.textContent).not.toMatch(/\[IBAN_\d+\]/);
  });

  it('loads an example and analyzes it immediately', () => {
    const { mount } = mountApp();
    const select = mount.querySelector<HTMLSelectElement>('.example-select')!;
    expect(select.options.length).toBeGreaterThanOrEqual(7); // placeholder + examples

    select.value = '0';
    select.dispatchEvent(new Event('change'));

    const textarea = textareaOf(mount);
    expect(textarea.value.length).toBeGreaterThan(100);
    expect(mount.querySelectorAll('.editor-backdrop mark').length).toBeGreaterThan(0);
  });

  it('fails closed: a detection error blocks the output instead of echoing text', () => {
    const { app, mount } = mountApp({
      analyze: () => {
        throw new Error('detector exploded');
      },
    });
    typeText(mount, app, SAMPLE);

    const alert = mount.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('would be blocked');
    const output = mount.querySelector('.output-pane')!;
    expect(output.textContent).not.toContain('Please wire to');
  });

  it('clearing the text restores the empty state', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);
    expect(mount.querySelectorAll('.editor-backdrop mark').length).toBeGreaterThan(0);

    typeText(mount, app, '');
    expect(mount.querySelectorAll('.editor-backdrop mark')).toHaveLength(0);
    expect(mount.querySelector('.summary-body')!.textContent).toContain('Nothing analyzed yet');
  });

  it('shows the not-masked distinction for known test values', () => {
    const { app, mount } = mountApp();
    // Reserved example domains are detected but non-sensitive: never masked.
    // (The classic 4111… test card is unusable here: its digits also validate
    // as a JP My Number, and that sensitive overlap wins until M8 fusion.)
    typeText(mount, app, 'Write to support@example.com for help.');

    const testMarks = mount.querySelectorAll('.editor-backdrop mark.hl-test');
    expect(testMarks.length).toBeGreaterThanOrEqual(1);
    const output = mount.querySelector('.output-pane')!;
    expect(output.textContent).toContain('support@example.com');
  });

  it('REGRESSION: re-selecting the placeholder option leaves the text alone', () => {
    const { mount } = mountApp();
    const select = mount.querySelector<HTMLSelectElement>('.example-select')!;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    const textarea = textareaOf(mount);

    const draft = textarea.value + ' — my own edits';
    textarea.value = draft;
    // Number('') === 0 would load example 0 here without the guard.
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(textarea.value).toBe(draft);
  });

  it('mirrors typed text into the backdrop synchronously, before the debounce', () => {
    vi.useFakeTimers();
    const { mount } = mountApp();
    const textarea = textareaOf(mount);
    textarea.value = SAMPLE;
    textarea.dispatchEvent(new Event('input'));

    // Visible immediately (the backdrop is the glyph layer)…
    const backdrop = mount.querySelector('.editor-backdrop')!;
    expect(backdrop.textContent!.replace(/\u200B$/, '')).toBe(SAMPLE);
    // …while highlights wait for the debounced analysis.
    expect(mount.querySelectorAll('.editor-backdrop mark')).toHaveLength(0);
    vi.advanceTimersByTime(250);
    expect(mount.querySelectorAll('.editor-backdrop mark').length).toBeGreaterThanOrEqual(2);
  });

  it('IME: composition gates analysis but not visibility; compositionend resumes', () => {
    vi.useFakeTimers();
    const { mount } = mountApp();
    const textarea = textareaOf(mount);
    const backdrop = mount.querySelector('.editor-backdrop')!;

    textarea.dispatchEvent(new Event('compositionstart'));
    textarea.value = SAMPLE;
    textarea.dispatchEvent(new Event('input'));

    // The in-progress composition is visible…
    expect(backdrop.textContent!.replace(/\u200B$/, '')).toBe(SAMPLE);
    // …but analysis stays gated for as long as the composition runs.
    vi.advanceTimersByTime(1000);
    expect(mount.querySelectorAll('.editor-backdrop mark')).toHaveLength(0);

    textarea.dispatchEvent(new Event('compositionend'));
    vi.advanceTimersByTime(250);
    expect(mount.querySelectorAll('.editor-backdrop mark').length).toBeGreaterThanOrEqual(2);
  });

  it('fail-closed keeps the typed text visible in the input pane', () => {
    const { app, mount } = mountApp({
      analyze: () => {
        throw new Error('detector exploded');
      },
    });
    typeText(mount, app, SAMPLE);

    expect(mount.querySelector('[role="alert"]')).not.toBeNull();
    const backdrop = mount.querySelector('.editor-backdrop')!;
    expect(backdrop.textContent!.replace(/\u200B$/, '')).toBe(SAMPLE);
  });

  it('output-pane hover shows a replacement card; plain text hides it', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);

    const mark = mount.querySelector<HTMLElement>('.output-pane mark[data-o]')!;
    mark.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 20 }));
    const tooltip = mount.querySelector<HTMLElement>('.tooltip')!;
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toContain('replaced with');

    const pane = mount.querySelector<HTMLElement>('.output-pane')!;
    pane.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
    expect(tooltip.hidden).toBe(true);
  });

  it('input-pane hover resolves the mark under the textarea to a candidate card', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);
    const textarea = textareaOf(mount);
    const mark = mount.querySelector<HTMLElement>('.editor-backdrop mark[data-i]')!;

    // jsdom has no elementsFromPoint; the app reads it off `document`.
    const doc = document as Document & { elementsFromPoint?: (x: number, y: number) => Element[] };
    doc.elementsFromPoint = () => [textarea, mark];
    try {
      textarea.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 }));
      const tooltip = mount.querySelector<HTMLElement>('.tooltip')!;
      expect(tooltip.hidden).toBe(false);
      expect(tooltip.textContent).toContain('confidence');
      expect(tooltip.textContent).toContain('detector');

      doc.elementsFromPoint = () => [textarea];
      textarea.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
      expect(tooltip.hidden).toBe(true);
    } finally {
      delete doc.elementsFromPoint;
    }
  });
});

/**
 * The exposure panel (M8).
 *
 * SPEC requires the score be explainable by construction, so the panel is
 * tested for its DECOMPOSITION, not just for showing a number — a bare 0–100
 * with no breakdown would be the "score that cannot show its work" SPEC rules
 * out. The limitation text is required to be visible wherever the score is.
 */
describe('exposure panel', () => {
  it('shows a score, its category split, and the largest contributors', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);

    const panel = mount.querySelector('.exposure-body')!;
    expect(panel.querySelector('.exposure-score')?.textContent).toMatch(/^\d+$/);
    expect(panel.querySelectorAll('.exposure-row').length).toBeGreaterThan(0);
    expect(panel.querySelectorAll('.exposure-contrib').length).toBeGreaterThan(0);
  });

  it('always states the limitation alongside the score', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);
    expect(mount.querySelector('.exposure-limitation')?.textContent).toContain(
      'not a guarantee of safety',
    );
  });

  it('scores a document with nothing sensitive as having nothing to score', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, 'The meeting moved to Thursday and everyone agreed.');
    expect(mount.querySelector('.exposure-body')?.textContent).toContain('nothing to score');
  });

  it('exposes the meter to assistive technology with its real value', () => {
    const { app, mount } = mountApp();
    typeText(mount, app, SAMPLE);
    const meter = mount.querySelector('.exposure-meter');
    expect(meter?.getAttribute('role')).toBe('meter');
    expect(Number(meter?.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(meter?.getAttribute('aria-valuemax')).toBe('100');
  });

  it('rises when more sensitive values are added, never falls', () => {
    // The user-visible face of the monotonicity property.
    const { app, mount } = mountApp();
    const read = () => Number(mount.querySelector('.exposure-score')?.textContent ?? '0');

    typeText(mount, app, `Contact ${generate.generateValidEmail(31)}.`);
    const withEmail = read();
    typeText(mount, app, `Contact ${generate.generateValidEmail(31)}. IBAN ${generate.generateValidIban(32)}.`);
    expect(read()).toBeGreaterThanOrEqual(withEmail);
  });
});
