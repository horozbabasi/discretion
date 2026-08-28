// @vitest-environment jsdom
/**
 * Discriminating the send control from the other controls beside a composer.
 *
 * A real composer toolbar holds send AND microphone AND attach, so "more than
 * one control" is the normal case and refusing every time makes the
 * composer-anchored fallback useless. What is needed is a way to say which one
 * IS the send control.
 *
 * Every rule here is a POSITIVE property of sending. None works by excluding
 * the microphone, and that constraint does real work: "not the mic" requires
 * knowing every control a toolbar might ever hold, and silently binds whatever
 * is added next.
 *
 * REFUSAL REMAINS THE DEFAULT — these tests pin that as hard as they pin the
 * successes, because a discriminator that guesses converts a visible failure
 * into a wrong binding, and a wrong send binding has the same consequence as a
 * wrong composer.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { discriminateSendControl } from '../src/adapters/sendControl.js';
import { giveEverythingLayout, resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

const noIcons = (): boolean => false;

function setup(html: string): { composer: Element; controls: HTMLElement[] } {
  document.body.innerHTML = html;
  giveEverythingLayout();
  const composer = document.querySelector('[contenteditable], textarea') as Element;
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]'),
  );
  return { composer, controls };
}

describe('rule 1 — native form submission', () => {
  it('identifies the control that submits the form the composer is in', () => {
    // A platform relationship, not a naming convention: it survives every
    // rename, restyle and class-hash change.
    const { composer, controls } = setup(
      '<form><div contenteditable="true"></div>' +
        '<button type="button" class="mic">mic</button>' +
        '<button type="submit" class="send">go</button></form>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.rule).toBe('form-submit');
    expect((outcome.control as HTMLElement).className).toBe('send');
  });

  it('counts a bare <button> in a form, which defaults to type=submit', () => {
    const { composer, controls } = setup(
      '<form><div contenteditable="true"></div>' +
        '<button type="button" class="mic">mic</button>' +
        '<button class="send">go</button></form>',
    );
    expect(discriminateSendControl(controls, composer, noIcons).rule).toBe('form-submit');
  });

  it('ignores a submit button belonging to a DIFFERENT form', () => {
    // Otherwise a search box elsewhere on the page wins.
    const { composer, controls } = setup(
      '<form id="search"><button type="submit" class="search-go">find</button></form>' +
        '<div><div contenteditable="true"></div>' +
        '<button type="button" class="mic">mic</button></div>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.control).toBeNull();
  });
});

describe('rule 2 — declared ARIA relationship', () => {
  it('identifies a control whose aria-controls names the composer', () => {
    const { composer, controls } = setup(
      '<div><div id="prompt" contenteditable="true"></div>' +
        '<div role="button" class="mic">mic</div>' +
        '<div role="button" class="send" aria-controls="prompt">go</div></div>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.rule).toBe('aria-controls');
    expect((outcome.control as HTMLElement).className).toBe('send');
  });
});

describe('rule 3 — send icon identity', () => {
  it('identifies the control carrying a send icon', () => {
    const { composer, controls } = setup(
      '<div><div contenteditable="true"></div>' +
        '<div role="button" class="mic"><i class="mic-icon"></i></div>' +
        '<div role="button" class="send"><i class="send-icon"></i></div></div>',
    );
    const hasSendIcon = (c: Element): boolean => c.querySelector('.send-icon') !== null;
    const outcome = discriminateSendControl(controls, composer, hasSendIcon);
    expect(outcome.rule).toBe('send-icon');
    expect((outcome.control as HTMLElement).className).toBe('send');
  });
});

describe('refusal is the default', () => {
  it('refuses when NO rule identifies anything', () => {
    const { composer, controls } = setup(
      '<div><div contenteditable="true"></div>' +
        '<div role="button" class="a">a</div>' +
        '<div role="button" class="b">b</div></div>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.control).toBeNull();
    expect(outcome.rule).toBeNull();
    // Every rule is reported as tried, so "no rule fired" is distinguishable
    // from "the discriminator never ran".
    expect(outcome.attempts.map((a) => a.rule)).toEqual([
      'form-submit',
      'aria-controls',
      'send-icon',
    ]);
  });

  it('refuses when a rule matches TWO candidates rather than tie-breaking', () => {
    // Two candidates satisfying the same rule is the same problem one level
    // down. Choosing between them would reintroduce exactly the tie-break the
    // ambiguity rule forbids.
    const { composer, controls } = setup(
      '<form><div contenteditable="true"></div>' +
        '<button type="submit" class="one">a</button>' +
        '<button type="submit" class="two">b</button></form>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.control).toBeNull();
    expect(outcome.attempts.find((a) => a.rule === 'form-submit')?.matched).toBe(2);
  });

  it('falls through to a weaker rule when a stronger one matches several', () => {
    // Two form-submit buttons, but only one carries a send icon.
    const { composer, controls } = setup(
      '<form><div contenteditable="true"></div>' +
        '<button type="submit" class="one">a</button>' +
        '<button type="submit" class="two"><i class="send-icon"></i></button></form>',
    );
    const hasSendIcon = (c: Element): boolean => c.querySelector('.send-icon') !== null;
    const outcome = discriminateSendControl(controls, composer, hasSendIcon);
    expect(outcome.rule).toBe('send-icon');
    expect((outcome.control as HTMLElement).className).toBe('two');
  });

  it('never works by excluding the other control', () => {
    // The constraint made concrete: a toolbar whose send button carries no
    // distinguishing property must REFUSE, even though a human can see which
    // one is not the microphone.
    const { composer, controls } = setup(
      '<div><div contenteditable="true"></div>' +
        '<div role="button" aria-label="Use microphone">mic</div>' +
        '<div role="button" aria-label="Send message">send</div></div>',
    );
    const outcome = discriminateSendControl(controls, composer, noIcons);
    expect(outcome.control).toBeNull();
  });
});
