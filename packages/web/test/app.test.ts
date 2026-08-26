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
});
