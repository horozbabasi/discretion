/**
 * The full M4 pipeline, end to end:
 *
 *   detect → mask → egress-guard the masked text (must pass) →
 *   simulate a model response that echoes and inflects the surrogates →
 *   stream it through the restorer under fuzzed chunking →
 *   assert the round trip — and that the RAW text would have been blocked.
 *
 * This is the property that ties the four M4 pieces into one guarantee:
 * what leaves is clean, what returns is restored, and the original could
 * never have left.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { normalize } from '../src/normalization.js';
import { runStage1 } from '../src/detect/runner.js';
import { Vault } from '../src/mask/vault.js';
import { maskOriginal } from '../src/mask/masker.js';
import { Restorer } from '../src/mask/restorer.js';
import { guardEgress } from '../src/mask/egressGuard.js';
import { generate } from '../src/index.js';

function buildDocument(seed: number): string {
  return (
    `Hi team, please wire the deposit to ${generate.generateValidIban(seed)} today. ` +
    `Card on file: ${generate.generateValidCard(seed + 1)}. ` +
    `Kimlik ${generate.generateValidTckn(seed + 2)} kayıtlı. ` +
    `Reach me at ${generate.generateValidEmail(seed + 3)} or ${generate.generateValidPhone(seed + 4)}. ` +
    `Wallet ${generate.generateValidBtc(seed + 5)} is funded.`
  );
}

describe('M4 end-to-end', () => {
  it('PROPERTY: detect → mask → guard → stream → restore round-trips under fuzzed chunking', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 << 20 }),
        fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 300 }),
        (seed, chunkSizes) => {
          const original = buildDocument(seed);
          const vault = new Vault();
          const candidates = runStage1(normalize(original));
          const { maskedText, entities } = maskOriginal(original, candidates, vault, { seed });
          expect(entities.length).toBeGreaterThanOrEqual(4);

          const auditor = vault.createEgressAuditor();
          // What leaves is clean; what would have left raw is blocked.
          expect(guardEgress(maskedText, auditor).ok).toBe(true);
          expect(guardEgress(original, auditor).ok).toBe(false);

          // The model echoes the masked text back; stream it in fuzzed chunks.
          const r = new Restorer(vault);
          let out = '';
          let pos = 0;
          for (const size of chunkSizes) {
            if (pos >= maskedText.length) break;
            out += r.push(maskedText.slice(pos, pos + size));
            pos += size;
          }
          out += r.push(maskedText.slice(pos));
          out += r.finish();
          expect(out).toBe(original);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('a response that REUSES surrogates in new sentences restores them in place', () => {
    const original = `Contact ${generate.generateValidEmail(5)} about IBAN ${generate.generateValidIban(6)}.`;
    const vault = new Vault();
    const m = maskOriginal(original, runStage1(normalize(original)), vault);
    const [emailSur, ibanSur] = [m.entities[0]!.replacement, m.entities[1]!.replacement];

    const response =
      `I've written to ${emailSur} as requested. ` +
      `The transfer to ${ibanSur} clears Monday; confirm with ${emailSur} afterwards.`;
    const r = new Restorer(vault);
    const restored = r.push(response) + r.finish();

    expect(restored).toContain(m.entities[0]!.original);
    expect(restored).toContain(m.entities[1]!.original);
    expect(restored).not.toContain(emailSur);
    expect(restored).not.toContain(ibanSur);
    // Both surrogate mentions of the email restored.
    expect(restored.split(m.entities[0]!.original)).toHaveLength(3);
  });

  it('token mode round-trips the same way', () => {
    const original = `Send to ${generate.generateValidEmail(9)} and ${generate.generateValidIban(10)}.`;
    const vault = new Vault();
    const m = maskOriginal(original, runStage1(normalize(original)), vault, { mode: 'token' });
    expect(m.maskedText).toMatch(/\[EMAIL_\d+\]/);
    expect(guardEgress(m.maskedText, vault.createEgressAuditor()).ok).toBe(true);
    const r = new Restorer(vault);
    expect(r.push(m.maskedText) + r.finish()).toBe(original);
  });

  it('the restorer leaves an unknown (hallucinated) bracket token visible', () => {
    const vault = new Vault();
    vault.register({ type: 'EMAIL', original: 'a@real.com', replacement: '[EMAIL_1]' });
    const r = new Restorer(vault);
    const out = r.push('see [EMAIL_1] and [EMAIL_7] there') + r.finish();
    // The known token restores; the model-invented one stays visible
    // rather than being guessed at (SPEC.md: unresolvable stay visible).
    expect(out).toBe('see a@real.com and [EMAIL_7] there');
  });
});
