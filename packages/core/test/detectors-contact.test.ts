/**
 * Contact & network detector family.
 *
 * SPEC.md TESTS: "Every validator: valid cases, and above all invalid cases."
 * Per AUTHORING.md every detector gets: valid vectors, MORE invalid vectors,
 * a generator-backed property test, and an offset test through runStage1.
 * None of these formats carries a checksum, so the mutation half of the
 * property standard is skipped (a mutated email is usually still an email);
 * precision here comes from the invalid-vector suites instead.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/contact/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, RegionCode } from '../src/detect/types.js';
import type { Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidEmail,
  generateValidPhone,
  generateValidIpv4,
  generateValidIpv6,
  generateValidMac,
  generateValidCredentialUrl,
  VALID_E164_POOL,
} from '../src/generate/contact.js';

const email = getDetector('email')!;
const phone = getDetector('phone')!;
const ipv4 = getDetector('ip-v4')!;
const ipv6 = getDetector('ip-v6')!;
const mac = getDetector('mac-address')!;
const urlCred = getDetector('url-with-credentials')!;

function scan(text: string, detector: Detector, defaultRegion?: RegionCode): Stage1Candidate[] {
  return runStage1(normalize(text), {
    detectors: [detector],
    ...(defaultRegion !== undefined ? { defaultRegion } : {}),
  });
}

/** Assert exactly one candidate whose canonical/sensitivity can be probed. */
function only(text: string, detector: Detector, defaultRegion?: RegionCode): Stage1Candidate {
  const found = scan(text, detector, defaultRegion);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string, detector: Detector, defaultRegion?: RegionCode): void {
  expect(scan(text, detector, defaultRegion), `expected no candidate in: ${text}`).toHaveLength(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL
// ─────────────────────────────────────────────────────────────────────────────

describe('email', () => {
  it('accepts real-format addresses', () => {
    expect(only('mail john.doe@gmail.com now', email).sensitive).toBe(true);
    only('u user+tag@sub.domain.co.uk v', email);
    only('idn müller@münchen.de here', email);
    only('punycode x@xn--bcher-kva.de ok', email);
    only('quoted "john doe"@corp.com works', email);
  });

  it('classifies reserved documentation domains non-sensitive (SPEC.md: "reject reserved example domains")', () => {
    expect(only('admin@example.com', email).sensitive).toBe(false);
    expect(only('a@sub.example.org', email).sensitive).toBe(false);
    expect(only('dev@service.test', email).sensitive).toBe(false);
    expect(only('x@broken.invalid', email).sensitive).toBe(false);
  });

  it('rejects structural violations (more invalid than valid)', () => {
    none('plainaddress', email); // no @
    none('a@nodot', email); // no TLD label
    none('double a..b@x.com dots', email); // consecutive dots
    none('trail a.@x.com dot', email); // local ends with dot
    none('hyphen a@-bad.com edge', email); // label starts with hyphen
    none('hyphen a@bad-.com edge', email); // label ends with hyphen
    none('numeric a@x.123 tld', email); // all-digit TLD
    none(`long ${'x'.repeat(65)}@x.com local`, email); // local > 64
    none(`label a@${'y'.repeat(64)}.com over`, email); // label > 63
    none('short a@x.c tld', email); // 1-char TLD
  });

  it('narrows the span past absorbed sentence punctuation', () => {
    const c = only("see .john@x.io done", email);
    expect(c.text).toBe('john@x.io');
  });

  it('canonicalizes the domain to lowercase, preserving the local part', () => {
    expect(only('a JOHN@GMAIL.COM b', email).canonical).toBe('JOHN@gmail.com');
  });

  it('PROPERTY: generated addresses always validate as sensitive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidEmail(seed);
        const c = only(`contact ${value} please`, email);
        expect(c.sensitive).toBe(true);
      }),
      { numRuns: 300 },
    );
    // No checksum exists for emails, so the mutation half is deliberately
    // omitted — a single-character mutation usually yields another valid
    // address. Precision is carried by the invalid-vector suite above.
  });

  it('OFFSETS: original span survives normalization shifts', () => {
    const original = 'ﬁrst​ write to john.doe@gmail.com today';
    const norm = normalize(original);
    const found = runStage1(norm, { detectors: [email] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('john.doe@gmail.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHONE
// ─────────────────────────────────────────────────────────────────────────────

describe('phone', () => {
  it('accepts international numbers without any region context', () => {
    expect(only('call +1 212 555 0123 now', phone).canonical).toBe('+12125550123');
    expect(only('tel +44 20 7946 0958.', phone).canonical).toBe('+442079460958');
    expect(only('ara +90 532 123 45 67 beni', phone).canonical).toBe('+905321234567');
  });

  it('validates national formats only against the configured default region', () => {
    expect(only('call (212) 555-0123 now', phone, 'US').canonical).toBe('+12125550123');
    expect(only('ara 0532 123 45 67 beni', phone, 'TR').canonical).toBe('+905321234567');
    // Same digits, no region → dropped, not guessed.
    none('call (212) 555-0123 now', phone);
  });

  it('records how the region was resolved', () => {
    expect(only('+49 151 23456789', phone).metadata?.['viaDefaultRegion']).toBe(false);
    expect(only('(212) 555-0123', phone, 'US').metadata?.['viaDefaultRegion']).toBe(true);
  });

  it('rejects non-numbers (more invalid than valid)', () => {
    none('short 123456 run', phone, 'US');
    none('year range 2019-2023 report', phone, 'DK'); // Danish 8-digit trap
    none('date 2023-08-26 log', phone, 'US');
    none('date 26/08/2023 log', phone, 'DK');
    none('bad +999 12345678 country', phone);
    none('card 4111 1111 1111 1111 digits', phone, 'US'); // 16 digits, not a plan
    none('overlong 123456789012345678 run', phone, 'US');
    none('us-invalid (999) 999-9999 shape', phone, 'US'); // NANP area 999 invalid
  });

  it('the generator pool itself stays valid under the bundled metadata', () => {
    // Pins the pool: a libphonenumber metadata update that invalidates an
    // entry fails HERE, not mysteriously inside the property test.
    for (const e164 of VALID_E164_POOL) {
      expect(only(`n ${e164} k`, phone).canonical).toBe(e164);
    }
  });

  it('PROPERTY: generated numbers always validate to their E.164 pool entry', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidPhone(seed);
        const found = scan(`call ${value} today`, phone);
        expect(found).toHaveLength(1);
        expect(VALID_E164_POOL).toContain(found[0]!.canonical);
      }),
      { numRuns: 300 },
    );
    // Phone plans have no checksum; mutation half omitted (see file header).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'Please​ call +44 20 7946 0958, thanks';
    const found = runStage1(normalize(original), { detectors: [phone] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('+44 20 7946 0958');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IPv4
// ─────────────────────────────────────────────────────────────────────────────

describe('ip-v4', () => {
  it('accepts and scopes valid addresses', () => {
    const pub = only('dns at 8.8.8.8 up', ipv4);
    expect(pub.rawConfidence).toBe(CONFIDENCE.HIGH);
    expect(pub.metadata?.['scope']).toBe('public');

    const priv = only('lan 10.1.2.3 host', ipv4);
    expect(priv.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(priv.metadata?.['scope']).toBe('private');

    expect(only('local 127.0.0.1 loop', ipv4).metadata?.['scope']).toBe('loopback');
    expect(only('cgn 100.64.0.9 range', ipv4).metadata?.['scope']).toBe('cgn');
    expect(only('link 169.254.10.20 auto', ipv4).metadata?.['scope']).toBe('link-local');
  });

  it('classifies documentation/TEST-NET ranges non-sensitive (SPEC.md: lower sensitivity for reserved)', () => {
    expect(only('doc 203.0.113.7 example', ipv4).sensitive).toBe(false);
    expect(only('doc 198.51.100.1 example', ipv4).sensitive).toBe(false);
    expect(only('doc 192.0.2.55 example', ipv4).sensitive).toBe(false);
    expect(only('bcast 255.255.255.255 all', ipv4).sensitive).toBe(false);
    expect(only('zero 0.0.0.0 bind', ipv4).sensitive).toBe(false);
  });

  it('rejects invalid and embedded shapes (more invalid than valid)', () => {
    none('octet 256.1.1.1 high', ipv4);
    none('octet 1.2.3.999 high', ipv4);
    none('version v1.2.3.4 tag', ipv4);
    none('five 1.2.3.4.5 parts', ipv4);
    none('three 1.2.3 parts', ipv4);
    none('octet 1.2.3.4444 wide', ipv4);
    none('decimal 10.1.2.3.14 run', ipv4);
  });

  it('canonicalizes away octet zero-padding', () => {
    expect(only('log 192.168.001.001 entry', ipv4).canonical).toBe('192.168.1.1');
  });

  it('PROPERTY: generated addresses always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidIpv4(seed);
        expect(scan(`host ${value} up`, ipv4)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum in an IPv4 address; mutation half omitted (file header).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'srv​ at 8.8.4.4 alive';
    const found = runStage1(normalize(original), { detectors: [ipv4] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('8.8.4.4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IPv6
// ─────────────────────────────────────────────────────────────────────────────

describe('ip-v6', () => {
  it('accepts full, compressed, zoned and v4-mapped forms', () => {
    const g = only('at 2001:4860:4860::8888 dns', ipv6);
    expect(g.metadata?.['scope']).toBe('global');
    expect(g.rawConfidence).toBe(CONFIDENCE.HIGH);

    expect(only('lo ::1 back', ipv6).metadata?.['scope']).toBe('loopback');
    expect(only('ll fe80::1%eth0 zone', ipv6).metadata?.['zone']).toBe('eth0');
    expect(only('map ::ffff:192.168.1.1 v4', ipv6).metadata?.['scope']).toBe('v4-mapped');
    only('full fe80:0:0:0:2aa:ff:fe9a:4ca2 addr', ipv6);
  });

  it('classifies 2001:db8::/32 documentation non-sensitive', () => {
    const c = only('doc 2001:db8::1 example', ipv6);
    expect(c.sensitive).toBe(false);
    expect(c.metadata?.['scope']).toBe('documentation');
  });

  it('canonicalizes per RFC 5952 (longest zero run compressed, lowercase)', () => {
    expect(only('x 2001:0DB8:0:0:0:0:0:1 y', ipv6).canonical).toBe('2001:db8::1');
  });

  it('rejects non-addresses (more invalid than valid)', () => {
    none('time 12:30:45 stamp', ipv6);
    none('mac aa:bb:cc:dd:ee:ff addr', ipv6); // 6 groups, no '::'
    none('cpp std::vector<int> code', ipv6);
    none('rust Vec::new() call', ipv6);
    none('nine 1:2:3:4:5:6:7:8:9 groups', ipv6);
    none('twice 1::2::3 compressed', ipv6);
    none('wide 12345::1 group', ipv6);
    none('bare :: alone', ipv6); // unspecified — rejected as noise
    none('ratio 3:2 score', ipv6);
  });

  it('PROPERTY: generated addresses always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidIpv6(seed);
        expect(scan(`node ${value} up`, ipv6), value).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum; mutation half omitted (file header).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'ping​ 2001:db8:85a3::8a2e:370:7334 now';
    const found = runStage1(normalize(original), { detectors: [ipv6] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('2001:db8:85a3::8a2e:370:7334');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAC
// ─────────────────────────────────────────────────────────────────────────────

describe('mac-address', () => {
  it('accepts all three notations, canonicalized to lowercase colons', () => {
    expect(only('nic 00:1B:44:11:3A:B7 up', mac).canonical).toBe('00:1b:44:11:3a:b7');
    expect(only('nic 00-1b-44-11-3a-b7 up', mac).canonical).toBe('00:1b:44:11:3a:b7');
    expect(only('nic 001b.4411.3ab7 up', mac).canonical).toBe('00:1b:44:11:3a:b7');
  });

  it('marks broadcast and null addresses non-sensitive', () => {
    expect(only('bcast ff:ff:ff:ff:ff:ff frame', mac).sensitive).toBe(false);
    expect(only('null 00:00:00:00:00:00 addr', mac).sensitive).toBe(false);
  });

  it('exposes the administration and multicast bits', () => {
    const c = only('nic 02:00:5e:10:00:01 vm', mac);
    expect(c.metadata?.['locallyAdministered']).toBe(true);
    expect(c.metadata?.['multicast']).toBe(false);
  });

  it('rejects malformed and embedded shapes (more invalid than valid)', () => {
    none('five 00:1B:44:11:3A groups', mac);
    none('seven aa:bb:cc:dd:ee:ff:11 groups', mac);
    none('mixed 00:1B-44:11:3A:B7 seps', mac);
    none('hexno GG:1B:44:11:3A:B7 chars', mac);
    none('short 0:1B:44:11:3A:B7 octet', mac);
    none('uuid 123e4567-e89b-12d3-a456-426614174000 v4', mac);
  });

  it('PROPERTY: generated MACs always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidMac(seed);
        expect(scan(`iface ${value} up`, mac), value).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum; mutation half omitted (file header).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'dev​ mac 00:1b:44:11:3a:b7 seen';
    const found = runStage1(normalize(original), { detectors: [mac] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('00:1b:44:11:3a:b7');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL_WITH_CREDENTIALS
// ─────────────────────────────────────────────────────────────────────────────

describe('url-with-credentials', () => {
  it('accepts userinfo passwords and credential query params', () => {
    const u = only('db at https://bob:s3cret@internal.corp.com/x live', urlCred);
    expect(u.metadata?.['kind']).toBe('userinfo');
    expect(u.sensitive).toBe(true);

    const q = only('get https://api.corp.com/v1?api_key=AbCd1234efGh5678 now', urlCred);
    expect(q.metadata?.['kind']).toBe('query');
    expect(q.metadata?.['param']).toBe('api_key');

    only('tok https://h.io/cb?access_token=ya29.a0AfH6SMBx7 fin', urlCred);
  });

  it('marks placeholder and documentation-host credentials non-sensitive', () => {
    expect(only('ex https://user:pw@example.com/demo doc', urlCred).sensitive).toBe(false);
    expect(only('t https://api.io/x?api_key=YOUR_API_KEY here', urlCred).sensitive).toBe(false);
    expect(only('t https://api.io/x?token=${TOKEN} tmpl', urlCred).sensitive).toBe(false);
    expect(only('t https://api.io/x?token=xxxxxxxxxx mask', urlCred).sensitive).toBe(false);
  });

  it('rejects URLs without credentials (more invalid than valid)', () => {
    none('plain https://corp.com/page url', urlCred);
    none('user-only https://git@github.com/x/y.git clone', urlCred);
    none('weak https://corp.com/?key=north short', urlCred);
    none('weak https://corp.com/?sig=v2 short', urlCred);
    none('scp git@github.com:user/repo.git form', urlCred); // no scheme://
    none('param https://x.io/?page=2&lang=en none', urlCred);
    none('short https://x.io/?token=abc value', urlCred);
  });

  it('PROPERTY: generated credential URLs always validate as sensitive', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidCredentialUrl(seed);
        const found = scan(`fetch ${value} done`, urlCred);
        expect(found, value).toHaveLength(1);
        expect(found[0]!.sensitive).toBe(true);
      }),
      { numRuns: 300 },
    );
    // No checksum; mutation half omitted (file header).
  });

  it('OFFSETS: whole-URL span is exact mid-sentence', () => {
    const original = 'cfg​ uses https://ci:tok3nX@build.corp/x ok';
    const found = runStage1(normalize(original), { detectors: [urlCred] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('https://ci:tok3nX@build.corp/x');
  });
});
