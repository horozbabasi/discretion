/**
 * Secrets & credentials family: API_KEY, JWT, PRIVATE_KEY, CONNECTION_STRING,
 * GENERIC_SECRET.
 *
 * GENERIC_SECRET is the delicate one. SPEC.md forbids it firing on entropy
 * alone, and this suite pins that: with no Stage 3 context it can reach at
 * most CONFIDENCE.LOW, and the named non-secrets (UUID, git SHA, placeholder)
 * are actively suppressed. The runner test file already proves the LOW cap
 * mechanically; here we prove the entropy gate and suppressions.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/secrets/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { ZWSP } from './helpers.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidGithubToken,
  generateValidProviderToken,
  generateValidJwt,
  generateValidPem,
  generateValidConnectionString,
  generateHighEntropySecret,
} from '../src/generate/secrets.js';

const apiKey = getDetector('api-key')!;
const jwt = getDetector('jwt')!;
const pem = getDetector('pem-private-key')!;
const conn = getDetector('connection-string')!;
const generic = getDetector('generic-secret')!;

function scan(text: string, detector: Detector, ctx?: (s: number, e: number) => object): Stage1Candidate[] {
  return runStage1(normalize(text), {
    detectors: [detector],
    ...(ctx !== undefined ? { contextFor: ctx as never } : {}),
  });
}

function only(text: string, detector: Detector): Stage1Candidate {
  const found = scan(text, detector);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string, detector: Detector): void {
  expect(scan(text, detector), `expected no candidate in: ${text}`).toHaveLength(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// API_KEY
// ─────────────────────────────────────────────────────────────────────────────

describe('api-key', () => {
  it('accepts provider tokens and identifies the provider', () => {
    expect(only('key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789 env', apiKey).metadata?.['provider']).toBe('openai');
    expect(only('key AIzaSyD1234567890abcdefghijklmnopqrstuv here', apiKey).metadata?.['provider']).toBe('google');
    expect(only('key AKIAIOSFODNN7EXAMPLE creds', apiKey).metadata?.['provider']).toBe('aws');
    expect(only('key glpat-abcdefghij1234567890 token', apiKey).metadata?.['provider']).toBe('gitlab');
  });

  it('verifies GitHub token checksums', () => {
    const good = generateValidGithubToken(1);
    expect(only(`token ${good} set`, apiKey).metadata?.['provider']).toBe('github-pat');
    // Corrupt one body char → CRC fails → rejected.
    const bad = good.slice(0, 8) + (good[8] === 'A' ? 'B' : 'A') + good.slice(9);
    none(`token ${bad} set`, apiKey);
  });

  it('classifies Stripe test keys non-sensitive', () => {
    const c = only('key sk_test_abcdefghij1234567890ABCD test', apiKey);
    expect(c.sensitive).toBe(false);
    expect(c.metadata?.['test']).toBe(true);
  });

  it('rejects shape violations (more invalid than valid)', () => {
    none('key sk-short body', apiKey); // OpenAI body too short
    none('key AIzaTooShort key', apiKey); // Google must be exactly 35
    none('key AKIAlowercase0 bad', apiKey); // AWS body wrong length
    none('word describing something ordinary', apiKey); // no prefix
    none('key ghp_000 short', apiKey); // GitHub body too short
  });

  it('PROPERTY: generated provider and GitHub tokens always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`k ${generateValidProviderToken(seed)} v`, apiKey), 'provider').toHaveLength(1);
        expect(scan(`k ${generateValidGithubToken(seed)} v`, apiKey), 'github').toHaveLength(1);
      }),
      { numRuns: 300 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'export KEY=AKIAIOSFODNN7EXAMPLE now';
    const found = runStage1(normalize(original), { detectors: [apiKey] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('AKIAIOSFODNN7EXAMPLE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JWT
// ─────────────────────────────────────────────────────────────────────────────

describe('jwt', () => {
  it('accepts a real JWT whose header carries a valid alg', () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(only(`auth ${token} bearer`, jwt).metadata?.['alg']).toBe('HS256');
  });

  it('rejects structural violations (more invalid than valid)', () => {
    none('two eyJhbGciOiJIUzI1NiJ9.payloadonly here', jwt); // two segments
    // Header decodes but has no alg.
    none('noalg eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxIn0.sig field', jwt);
    // Header alg is not a registered algorithm.
    none('badalg eyJhbGciOiJYWFgifQ.eyJzdWIiOiIxIn0.sig field', jwt);
    none('empty eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0. sig', jwt); // empty sig
  });

  it('PROPERTY: generated JWTs always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`jwt ${generateValidJwt(seed)} ok`, jwt)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // A JWT signature cannot be verified without its key; structure is the
    // whole validator, so the mutation half is inapplicable and omitted.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE_KEY
// ─────────────────────────────────────────────────────────────────────────────

describe('pem-private-key', () => {
  it('accepts armored private-key blocks at MAXIMUM confidence', () => {
    const block = generateValidPem(3);
    const c = only(block, pem);
    expect(c.rawConfidence).toBe(CONFIDENCE.MAXIMUM);
    expect(String(c.metadata?.['keyType'])).toContain('PRIVATE KEY');
  });

  it('excludes public keys and certificates, and mismatched armor', () => {
    none('-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYI\n-----END PUBLIC KEY-----', pem);
    none('-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAK\n-----END CERTIFICATE-----', pem);
    none('-----BEGIN RSA PRIVATE KEY-----\nMIIBODAT\n-----END EC PRIVATE KEY-----', pem); // labels differ
    none('-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----', pem); // empty body
  });

  it('PROPERTY: generated PEM blocks always validate at MAXIMUM', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const found = scan(generateValidPem(seed), pem);
        expect(found).toHaveLength(1);
        expect(found[0]!.rawConfidence).toBe(CONFIDENCE.MAXIMUM);
      }),
      { numRuns: 200 },
    );
  });

  it('OFFSETS: whole-block span through normalization', () => {
    const block = generateValidPem(9);
    const original = `here${ZWSP} is my key:\n${block}\nkeep safe`;
    const found = runStage1(normalize(original), { detectors: [pem] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(slice).toContain('BEGIN');
    expect(slice).toContain('END');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION_STRING
// ─────────────────────────────────────────────────────────────────────────────

describe('connection-string', () => {
  it('accepts database URIs with a userinfo password', () => {
    const c = only('db postgres://app:s3cretpw@db.internal:5432/main up', conn);
    expect(c.metadata?.['scheme']).toBe('postgres');
    only('db mongodb+srv://u:p4ss@cluster0.mongodb.net/test run', conn);
    only('db redis://default:abc123def@10.0.3.4:6379 cache', conn);
  });

  it('marks placeholder passwords non-sensitive', () => {
    expect(only('db postgres://app:${DB_PASSWORD}@host:5432/db tmpl', conn).sensitive).toBe(false);
    expect(only('db mysql://root:changeme@localhost:3306/app demo', conn).sensitive).toBe(false);
  });

  it('rejects non-credential and non-database URIs (more invalid than valid)', () => {
    none('web https://user:pass@example.com/page url', conn); // not a DB scheme
    none('db postgres://db.internal:5432/main hostonly', conn); // no userinfo
    none('db postgres://app@db.internal/main useronly', conn); // no password
    none('db redis://10.0.3.4:6379 plain', conn);
  });

  it('PROPERTY: generated connection strings always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`dsn ${generateValidConnectionString(seed)} end`, conn)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC_SECRET — the entropy-only-is-not-enough detector
// ─────────────────────────────────────────────────────────────────────────────

describe('generic-secret', () => {
  it('never exceeds LOW confidence without Stage 3 context (SPEC.md: not on entropy alone)', () => {
    const secret = generateHighEntropySecret(5);
    const c = only(`token ${secret} value`, generic);
    expect(c.rawConfidence).toBe(CONFIDENCE.LOW);
    expect(c.metadata?.['awaitingContext']).toBe(true);
  });

  it('actively suppresses the SPEC-named non-secrets', () => {
    none('id 123e4567-e89b-12d3-a456-426614174000 uuid', generic);
    none('sha 356a192b7913b04c54574d18c28d46e6395428ab git', generic); // 40-hex SHA-1
    none('sha e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 obj', generic); // 64-hex
    none('ph your-api-key-here now', generic);
    none('ph xxxxxxxxxxxxxxxxxxxxxx mask', generic);
    none('ph CHANGEME now', generic);
  });

  it('requires length, distinctness, and mixed character classes', () => {
    none('short Ab9xY end', generic); // too short
    none('word aaaaaaaaaaaaaaaaaaaaaaaa run', generic); // one distinct char
    none('word abcdefghijklmnopqrstuvwx run', generic); // single class (letters)
  });

  it('reaches base confidence once a context signal is supplied', () => {
    const secret = generateHighEntropySecret(7);
    const found = scan(`api_key = ${secret}`, generic, () => ({ assignment: true }));
    expect(found).toHaveLength(1);
    // With context present the runner no longer caps it at LOW.
    expect(found[0]!.rawConfidence).toBeGreaterThan(CONFIDENCE.LOW);
  });

  it('PROPERTY: generated high-entropy secrets always pass the entropy gate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const found = scan(`x ${generateHighEntropySecret(seed)} y`, generic);
        expect(found.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
    // Entropy is a threshold, not a checksum; the suppression suite above is
    // the precision half. Threshold tuning is deferred to M3 per SPEC.md.
  });
});

describe('API_KEY span boundaries (M12 regression)', () => {
  const KEY = 'sk_live_7f3Kq2mNpX8vC1bWzR4tY6';

  const apiKeySpans = (text: string): string[] =>
    runStage1(normalize(text), {})
      .filter((candidate) => candidate.type === 'API_KEY')
      .map((candidate) => candidate.text);

  it('does not swallow a full stop at the end of a sentence', () => {
    // Found while running a README example at M12. The body charset includes
    // `.` because provider tokens contain them, and the match ran on into the
    // sentence punctuation.
    expect(apiKeySpans(`use key ${KEY}.`)).toEqual([KEY]);
  });

  it('gives the same span with and without trailing punctuation', () => {
    // THE REASON THIS MATTERS. The vault keys on the matched value, so the
    // two spellings below were two different values: the same key written at
    // the end of a sentence got a DIFFERENT surrogate from the same key
    // written mid-sentence, quietly breaking the consistency guarantee the
    // README documents.
    expect(apiKeySpans(`use key ${KEY}.`)).toEqual(apiKeySpans(`use key ${KEY} here`));
  });

  it('still matches a dot INSIDE a token', () => {
    // The fix must not become "reject dots", which would lose whole families
    // of provider tokens.
    const dotted = 'xoxb-1234.5678.abcdefghijklmnop';
    expect(getDetector('api-key')!.pattern.test(dotted)).toBe(true);
  });

  it('still matches the shortest body its provider allows', () => {
    // The fix split {10,130} into {9,129} plus one final character; an
    // off-by-one there would silently drop the shortest real tokens.
    //
    // 16 is Stripe's own minimum from the provider table, not the pattern's.
    // The first draft of this test used a 10-character body - the pattern's
    // floor - and failed, because the VALIDATOR rejected it. The test was
    // wrong, not the fix: the two lengths are different rules and only the
    // stricter one is observable through runStage1.
    const shortest = `sk_live_${'a'.repeat(16)}`;
    expect(apiKeySpans(`key ${shortest} here`)).toEqual([shortest]);
    expect(apiKeySpans(`key ${shortest}.`)).toEqual([shortest]);
  });
});
