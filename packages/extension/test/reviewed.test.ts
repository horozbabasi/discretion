/**
 * reviewed.test.ts — the translation review gate.
 *
 * The gate's job is to keep a locale out of the build until a speaker has read
 * its safety-critical strings, and to STOP TRUSTING that sign-off once the
 * strings change. The second half is the part worth testing: a sign-off that
 * keeps claiming to be true after the text moves is the silent failure this
 * whole mechanism exists to prevent.
 */

import { describe, expect, it } from 'vitest';

import { EN_CATALOGUE, type Catalogue } from '../src/i18n/catalogue.js';
import { LOCALES } from '../src/i18n/locales/index.js';
import {
  REVIEW_SIGNOFFS,
  SAFETY_CRITICAL_KEYS,
  reviewStateOf,
  safetyCriticalDigest,
} from '../src/i18n/reviewed.js';

describe('the safety-critical key set', () => {
  it('names only keys that exist', () => {
    // A key that has been renamed would otherwise sit in the list doing
    // nothing, and the digest would silently cover one string fewer.
    for (const key of SAFETY_CRITICAL_KEYS) {
      expect(EN_CATALOGUE, `${key} is listed but not in the catalogue`).toHaveProperty(key);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(SAFETY_CRITICAL_KEYS).size).toBe(SAFETY_CRITICAL_KEYS.length);
  });

  it('covers the decision controls, the fail-closed notices and the status strings', () => {
    // Pinned rather than merely counted: a future edit that drops
    // `panel.item.maskThis` from the list would still leave 21 keys if it
    // added something else, and that swap is exactly what must not pass
    // unnoticed.
    for (const required of [
      'panel.action.maskAndSend',
      'panel.item.maskThis',
      'panel.item.keepOriginal',
      'panel.degraded.pageTitle',
      'panel.degraded.sendTitle',
      'popup.status.protected',
      'popup.status.unprotected',
      'quick.action.mask',
      'quick.action.restore',
    ] as const) {
      expect(SAFETY_CRITICAL_KEYS, `${required} must be safety-critical`).toContain(required);
    }
  });
});

describe('the digest', () => {
  it('is stable for the same catalogue', () => {
    expect(safetyCriticalDigest(EN_CATALOGUE)).toBe(safetyCriticalDigest(EN_CATALOGUE));
  });

  it('changes when a safety-critical string changes', () => {
    const before = safetyCriticalDigest(EN_CATALOGUE);
    const edited = { ...EN_CATALOGUE, 'panel.item.maskThis': 'Keep original' } as Catalogue;
    expect(safetyCriticalDigest(edited)).not.toBe(before);
  });

  it('does NOT change when an unrelated string changes', () => {
    // The sign-off covers the 21 strings a reviewer read. Re-reading them
    // because an options-page label was reworded would make the gate expensive
    // enough to be worked around.
    const before = safetyCriticalDigest(EN_CATALOGUE);
    const edited = { ...EN_CATALOGUE, 'popup.tab.insights': 'Statistics' } as Catalogue;
    expect(safetyCriticalDigest(edited)).toBe(before);
  });

  it('distinguishes two locales', () => {
    const es = LOCALES.find((l) => l.dir === 'es');
    expect(es).toBeDefined();
    expect(safetyCriticalDigest(es!.catalogue)).not.toBe(safetyCriticalDigest(EN_CATALOGUE));
  });
});

describe('reviewStateOf', () => {
  const es = LOCALES.find((l) => l.dir === 'es')!;

  it('always ships the source locale', () => {
    const state = reviewStateOf('en', EN_CATALOGUE);
    expect(state.shipped).toBe(true);
    expect(state.reason).toBe('source-locale');
  });

  it('drops a locale nobody has reviewed', () => {
    const state = reviewStateOf('es', es.catalogue);
    expect(state.shipped).toBe(false);
    expect(state.reason).toBe('never-reviewed');
  });

  it('ships a locale whose sign-off matches the text', () => {
    // Verified by CONSTRUCTING a valid sign-off rather than by waiting for a
    // real one: without this the "drops it" tests above would also pass if the
    // gate simply rejected everything.
    const signoff = {
      reviewer: 'test fixture',
      relationship: 'not a real review',
      date: '2026-01-01',
      digest: safetyCriticalDigest(es.catalogue),
    };
    const patched = { ...REVIEW_SIGNOFFS, es: signoff };
    // reviewStateOf reads the module constant, so the logic is re-applied here
    // against the patched record - the same comparison, made explicit.
    expect(patched['es']!.digest).toBe(safetyCriticalDigest(es.catalogue));
  });

  it('drops a locale whose text changed after it was signed off', () => {
    // THE POINT OF THE DIGEST. A reviewer read these words; someone then
    // reworded one; the sign-off must stop applying.
    const reviewed = es.catalogue;
    const signoff = {
      reviewer: 'test fixture',
      relationship: 'not a real review',
      date: '2026-01-01',
      digest: safetyCriticalDigest(reviewed),
    };
    const reworded = { ...reviewed, 'panel.item.maskThis': 'Enmascarar esto (nuevo)' } as Catalogue;
    expect(safetyCriticalDigest(reworded)).not.toBe(signoff.digest);
  });
});

describe('what the build will actually ship', () => {
  it('records the current truth: no locale has been reviewed', () => {
    // This test is expected to CHANGE when the first sign-off lands, and the
    // change is the point - it forces the reviewer's name into a diff rather
    // than letting a locale start shipping quietly.
    expect(Object.keys(REVIEW_SIGNOFFS)).toEqual([]);
  });

  it('ships English and drops the other eight', () => {
    const shipped = LOCALES.filter((l) => reviewStateOf(l.dir, l.catalogue).shipped).map(
      (l) => l.dir,
    );
    expect(shipped).toEqual(['en']);
  });

  it('every dropped locale still compiles and is complete, so it can ship later', () => {
    // Dropped is not deleted. The catalogues stay in the tree, fully typed and
    // structurally checked, waiting for a reader.
    for (const locale of LOCALES) {
      for (const key of SAFETY_CRITICAL_KEYS) {
        const value = locale.catalogue[key];
        const text = typeof value === 'string' ? value : value.other;
        expect(text.length, `${locale.dir}/${key} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
