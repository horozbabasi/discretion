// @vitest-environment jsdom
/**
 * The hover cards are the SPEC-mandated "type, confidence, explanation on
 * hover" — these tests pin their content for every variant: sensitive and
 * test-value candidates, with and without a validator, and the three
 * replacement flavours (surrogate, token mode, recorded fallback).
 */

import { describe, expect, it } from 'vitest';

import type { MaskedEntity, Stage1Candidate } from '@discretion/core';
import { candidateCard, replacementCard } from '../src/tooltip.js';

function candidate(overrides: Partial<Stage1Candidate> = {}): Stage1Candidate {
  return {
    text: 'a@b.co',
    type: 'EMAIL',
    start: 0,
    end: 6,
    originalStart: 0,
    originalEnd: 6,
    rawConfidence: 0.85,
    stage: 'stage1-validated-identifier',
    detectorId: 'email',
    sensitive: true,
    canonical: 'a@b.co',
    ...overrides,
  };
}

function entity(overrides: Partial<MaskedEntity> = {}): MaskedEntity {
  return {
    type: 'IBAN',
    originalStart: 0,
    originalEnd: 22,
    original: 'DE44500105175407324931',
    replacement: 'DE06051433067366675251',
    vaultId: 'v1',
    fallback: false,
    ...overrides,
  };
}

describe('candidateCard', () => {
  it('shows type, tier, raw confidence, detector, and validator', () => {
    const card = candidateCard(candidate({ validatorPassed: 'structural-idn' }));
    const text = card.textContent!;
    expect(text).toContain('Email');
    expect(text).toContain('high');
    expect(text).toContain('raw 0.85');
    expect(text).toContain('uncalibrated until M8');
    expect(text).toContain('email');
    expect(text).toContain('structural-idn');
  });

  it('omits the validator row when no validator passed, and shows the low tier', () => {
    const card = candidateCard(candidate({ rawConfidence: 0.3 }));
    expect(card.textContent).not.toContain('validated by');
    expect(card.textContent).toContain('low');
  });

  it('labels known test values as detected-never-masked', () => {
    const card = candidateCard(candidate({ sensitive: false }));
    expect(card.textContent).toContain('Known test value');
    expect(card.textContent).toContain('never masked');
  });
});

describe('replacementCard', () => {
  it('describes a format-preserving surrogate', () => {
    const card = replacementCard(entity());
    expect(card.textContent).toContain('IBAN');
    expect(card.textContent).toContain('format-preserving surrogate');
    expect(card.textContent).toContain('never leaves the page');
  });

  it('describes a bracket token', () => {
    const card = replacementCard(entity({ replacement: '[IBAN_1]' }));
    expect(card.textContent).toContain('bracket token');
    expect(card.textContent).not.toContain('fallback');
  });

  it('describes a recorded fallback distinctly', () => {
    const card = replacementCard(entity({ replacement: '[IBAN_1]', fallback: true }));
    expect(card.textContent).toContain('fallback, recorded in the vault');
  });

  it('never leaks the original value into the card', () => {
    const e = entity();
    const card = replacementCard(e);
    expect(card.textContent).not.toContain(e.original);
  });
});
