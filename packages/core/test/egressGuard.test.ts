/**
 * The egress guard: the invariant checker. These tests cover every
 * comparison layer, the pass-throughs, and — as important as detection —
 * that the leak REPORT itself never carries plaintext.
 */

import { describe, it, expect } from 'vitest';

import { normalize } from '../src/normalization.js';
import { runStage1 } from '../src/detect/runner.js';
import { Vault } from '../src/mask/vault.js';
import { maskOriginal } from '../src/mask/masker.js';
import { guardEgress } from '../src/mask/egressGuard.js';
import { generate } from '../src/index.js';

const ZWSP = '​';

function maskedSetup(seed = 1): { vault: Vault; text: string; masked: string; originals: string[] } {
  const email = generate.generateValidEmail(seed);
  const card = generate.generateValidCard(seed + 1);
  const iban = generate.generateValidIban(seed + 2);
  const text = `Mail ${email}, pay ${card}, wire ${iban}.`;
  const vault = new Vault();
  const masked = maskOriginal(text, runStage1(normalize(text)), vault, { seed }).maskedText;
  return { vault, text, masked, originals: [email, card, iban] };
}

describe('guardEgress', () => {
  it('blocks a raw plaintext leak and names the entry by id and type only', () => {
    const { vault, originals } = maskedSetup();
    const auditor = vault.createEgressAuditor();
    const verdict = guardEgress(`please translate: ${originals[0]}`, auditor);
    expect(verdict.ok).toBe(false);
    expect(verdict.leaks).toHaveLength(1);
    expect(verdict.leaks[0]!.type).toBe('EMAIL');
    expect(verdict.leaks[0]!.entryId).toMatch(/^v\d+$/);
    // THE REPORT NEVER CARRIES PLAINTEXT.
    expect(JSON.stringify(verdict)).not.toContain(originals[0]);
  });

  it('catches zero-width-obfuscated leaks (normalization strips them)', () => {
    const { vault, originals } = maskedSetup(7);
    const email = originals[0]!;
    const stuffed = email.slice(0, 3) + ZWSP + email.slice(3, 8) + ZWSP + email.slice(8);
    const verdict = guardEgress(`fwd ${stuffed} now`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
    expect(verdict.leaks[0]!.via).toBe('normalized');
  });

  it('catches case-variant leaks', () => {
    const { vault, originals } = maskedSetup(11);
    const verdict = guardEgress(`SEE ${originals[0]!.toUpperCase()} PLEASE`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
  });

  it('catches separator-variant leaks via the canonical pass', () => {
    const card = generate.generateValidCard(21);
    const spaced = card.replace(/(.{4})/g, '$1 ').trim();
    const text = `card ${spaced} on file`;
    const vault = new Vault();
    maskOriginal(text, runStage1(normalize(text)), vault);
    // Leak the same PAN written with hyphens instead of spaces.
    const hyphened = card.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    const verdict = guardEgress(`use ${hyphened} again`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
    expect(verdict.leaks[0]!.via).toBe('separator-insensitive');
  });

  it('catches a homoglyph-substituted leak (confusable folding)', () => {
    const vault = new Vault();
    const text = 'reach donata@example-corp.net today';
    const candidates = runStage1(normalize(text));
    maskOriginal(text, candidates, vault);
    // Cyrillic а (U+0430) replacing the Latin 'a' in a Latin-dominant token
    // is exactly what Stage 0 folds back.
    const leaked = 'donаta@example-corp.net';
    const verdict = guardEgress(`contact ${leaked}`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
  });

  it('passes a clean payload and, crucially, the MASKED text itself', () => {
    const { vault, masked } = maskedSetup(31);
    const auditor = vault.createEgressAuditor();
    expect(guardEgress('nothing sensitive here at all', auditor).ok).toBe(true);
    // Surrogates are not leaks — the masked text is exactly what may leave.
    expect(guardEgress(masked, auditor).ok).toBe(true);
  });

  it('reports every leaking entry when several leak at once', () => {
    const { vault, originals } = maskedSetup(41);
    const verdict = guardEgress(`all of it: ${originals.join(' / ')}`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
    expect(verdict.leaks.length).toBe(3);
    const types = verdict.leaks.map((l) => l.type).sort();
    expect(types).toEqual(['CREDIT_CARD', 'EMAIL', 'IBAN']);
  });

  it('handles the empty payload and the empty vault', () => {
    const { vault } = maskedSetup(51);
    expect(guardEgress('', vault.createEgressAuditor()).ok).toBe(true);
    const empty = new Vault();
    expect(guardEgress('anything at all', empty.createEgressAuditor()).ok).toBe(true);
  });

  it('a plaintext original inside a longer token is still a leak (no boundary requirement)', () => {
    const { vault, originals } = maskedSetup(61);
    const verdict = guardEgress(`x${originals[0]}y`, vault.createEgressAuditor());
    expect(verdict.ok).toBe(false);
  });
});
