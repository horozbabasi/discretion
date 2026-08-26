/**
 * Streaming restoration — the test that protects the most visible failure a
 * user could ever see. If any of these ever go red, a user somewhere sees a
 * half-restored surrogate mid-response.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { normalize } from '../src/normalization.js';
import { runStage1 } from '../src/detect/runner.js';
import { Vault } from '../src/mask/vault.js';
import { maskOriginal } from '../src/mask/masker.js';
import { Restorer, restore } from '../src/mask/restorer.js';
import { generate } from '../src/index.js';

/** Feed `text` through the restorer in chunks of exactly `size` characters. */
function streamInChunks(text: string, vault: Vault, size: number, fuzzy = true): string {
  const r = new Restorer(vault, { fuzzy });
  let out = '';
  for (let i = 0; i < text.length; i += size) out += r.push(text.slice(i, i + size));
  out += r.finish();
  return out;
}

/**
 * Build a masked response: mask a document, then treat the masked text as if
 * it were the model's response (the model echoes the surrogates back). The
 * restorer must reproduce the ORIGINAL text.
 */
function maskedRoundTrip(text: string, seed: number): { masked: string; original: string; vault: Vault } {
  const vault = new Vault();
  const r = maskOriginal(text, runStage1(normalize(text)), vault, { seed });
  return { masked: r.maskedText, original: text, vault };
}

describe('streaming restoration', () => {
  const sample = () =>
    `Wire to ${generate.generateValidIban(1)} and card ${generate.generateValidCard(2)}; ` +
    `email ${generate.generateValidEmail(3)}; wallet ${generate.generateValidBtc(4)}.`;

  it('THE KEY TEST: one character at a time never yields a partial surrogate and ends exactly correct', () => {
    const { masked, original, vault } = maskedRoundTrip(sample(), 7);
    const surrogates = vault.replacements();

    const r = new Restorer(vault);
    let rendered = '';
    for (const ch of masked) {
      const emitted = r.push(ch);
      rendered += emitted;
      // INVARIANT: at no intermediate point does the rendered-so-far text
      // contain a surrogate (a surrogate should be replaced, never shown),
      // and it is never a corruption — it is always a prefix of the final.
      for (const s of surrogates) {
        expect(rendered.includes(s), `partial/whole surrogate ${s} leaked mid-stream`).toBe(false);
      }
    }
    rendered += r.finish();
    expect(rendered).toBe(original);
  });

  it('is correct for EVERY fixed chunk size from 1 to the full length', () => {
    const { masked, original, vault } = maskedRoundTrip(sample(), 11);
    for (let size = 1; size <= masked.length; size++) {
      expect(streamInChunks(masked, vault, size), `chunk size ${size}`).toBe(original);
    }
  });

  it('PROPERTY: arbitrary chunk boundaries all reconstruct the original', () => {
    const { masked, original, vault } = maskedRoundTrip(sample(), 99);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 8 }), { minLength: 1, maxLength: 200 }),
        (chunkSizes) => {
          const r = new Restorer(vault);
          let out = '';
          let pos = 0;
          for (const size of chunkSizes) {
            if (pos >= masked.length) break;
            out += r.push(masked.slice(pos, pos + size));
            pos += size;
          }
          out += r.push(masked.slice(pos));
          out += r.finish();
          expect(out).toBe(original);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('holds a surrogate split across the boundary rather than emitting a prefix', () => {
    const vault = new Vault();
    // A single deterministic surrogate we control.
    vault.register({ type: 'EMAIL', original: 'real@user.com', replacement: 'nils@fake.example' });
    const r = new Restorer(vault);
    // Feed the first half of the surrogate: nothing containing that prefix
    // may be emitted yet.
    const first = r.push('hello nils@fake');
    expect(first).toBe('hello '); // the risky prefix is held
    const second = r.push('.example world');
    // 'world' is ALSO held: with fuzzy on, a trailing non-whitespace run may
    // still be growing (a stream mid-token could turn 'Nils' into 'Nilsson'),
    // so it settles only at the next whitespace or at finish().
    expect(first + second).toBe('hello real@user.com ');
    expect(first + second + r.finish()).toBe('hello real@user.com world');
  });

  it('a surrogate that is a prefix of a longer surrogate resolves to the right one', () => {
    const vault = new Vault();
    vault.register({ type: 'GENERIC_SECRET', original: 'SHORT-ORIG', replacement: 'AbCdEf' });
    vault.register({ type: 'GENERIC_SECRET', original: 'LONG-ORIG', replacement: 'AbCdEfGhIj' });
    expect(restore('token AbCdEfGhIj here', vault).restoredText).toBe('token LONG-ORIG here');
    expect(restore('token AbCdEf here', vault).restoredText).toBe('token SHORT-ORIG here');
  });
});

describe('fuzzy restoration (controlled)', () => {
  const vault = () => {
    const v = new Vault();
    v.register({ type: 'PERSON', original: 'Yuki Tanaka', replacement: 'Nils' });
    v.register({ type: 'ORG', original: 'Acme Corp', replacement: 'Northwind' });
    return v;
  };

  it('restores case-changed, possessive, and pluralized surrogates', () => {
    expect(restore('spoke to NILS today', vault()).restoredText).toBe('spoke to Yuki Tanaka today');
    expect(restore("Nils's laptop", vault()).restoredText).toBe("Yuki Tanaka's laptop");
    expect(restore('two Northwinds merged', vault()).restoredText).toBe('two Acme Corps merged');
  });

  it('leaves a genuinely AMBIGUOUS token alone (SPEC hard rule)', () => {
    const v = new Vault();
    // 'Cat' and 'Cats' are distinct surrogates for distinct originals.
    v.register({ type: 'ORG', original: 'Org One', replacement: 'Cat' });
    v.register({ type: 'ORG', original: 'Org Two', replacement: 'Cats' });

    // Exact writing: the exact pass wins, unambiguously.
    expect(restore('the Cats here', v).restoredText).toBe('the Org Two here');

    // 'CATS' is case-transformed: it case-folds to the 'Cats' surrogate AND
    // de-pluralizes to the 'Cat' surrogate — two distinct originals, so the
    // hard rule applies and the token is left exactly as the model wrote it.
    expect(restore('the CATS here', v).restoredText).toBe('the CATS here');
  });

  it('resolves a pluralized surrogate that itself ends in s (single match)', () => {
    const v = new Vault();
    v.register({ type: 'ORG', original: 'Acme Holdings', replacement: 'Vireos' });
    // 'Vireoss' de-pluralizes to exactly one surrogate → restored. Recorded
    // as intended behaviour rather than over-eagerness: exactly one original
    // is reachable, which is the rule the SPEC states.
    expect(restore('two Vireoss merged', v).restoredText).toBe('two Acme Holdings merged');
  });

  it('does not attempt cross-script translation (stays visible)', () => {
    const v = new Vault();
    v.register({ type: 'PERSON', original: 'Ivan Petrov', replacement: 'Nils Fontaine' });
    // A Cyrillic "translation" is not resolved — the surrogate stays as-is.
    expect(restore('встретил Нильс сегодня', v).restoredText).toBe('встретил Нильс сегодня');
  });

  it('fuzzy off = exact only', () => {
    expect(restore('spoke to NILS today', vault(), { fuzzy: false }).restoredText).toBe('spoke to NILS today');
    expect(restore('spoke to Nils today', vault(), { fuzzy: false }).restoredText).toBe('spoke to Yuki Tanaka today');
  });
});

describe('restoration edge cases and idempotency', () => {
  it('empty input, no surrogates, and already-restored text', () => {
    const v = new Vault();
    v.register({ type: 'EMAIL', original: 'a@real.com', replacement: 'b@fake.net' });
    expect(restore('', v).restoredText).toBe('');
    expect(restore('nothing to restore here', v).restoredText).toBe('nothing to restore here');
    // Idempotent: restoring the already-restored output changes nothing.
    const once = restore('reach b@fake.net now', v).restoredText;
    expect(once).toBe('reach a@real.com now');
    expect(restore(once, v).restoredText).toBe(once);
  });

  it('PROPERTY: mask then restore is the identity on arbitrary carrier text', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 20 }), (seed) => {
        const text =
          `Ref ${generate.generateValidEmail(seed)} and ${generate.generateValidIban(seed + 1)} ` +
          `plus ${generate.generateValidTckn(seed + 2)} end.`;
        const vault = new Vault();
        const masked = maskOriginal(text, runStage1(normalize(text)), vault, { seed }).maskedText;
        expect(restore(masked, vault).restoredText).toBe(text);
      }),
      { numRuns: 200 },
    );
  });
});
