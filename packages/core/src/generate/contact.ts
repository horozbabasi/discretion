/**
 * Valid-value generators for the contact & network family.
 *
 * Deterministic by seed, never call the validators they feed (no
 * circularity), and are reused by M3's corpus generator. None of these
 * formats carries a checksum, so the paired property tests assert
 * "generated value always validates" without the single-character-mutation
 * half — a mutated email or IP is usually still a valid email or IP.
 */

import { mulberry32 } from './prng.js';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

const LOCALS = [
  'john.doe', 'jane_doe', 'a', 'user+tag', 'dev-ops', "o'brien", 'x.y.z',
  'müller', 'björn.b', 'test123', 'first.middle.last', '_service',
];
const DOMAINS = [
  'gmail.com', 'yandex.ru', 'firma.de', 'corp.co.uk', 'startup.io',
  'münchen.de', 'xn--bcher-kva.de', 'sub.domain.net', 'a-b.org', 'q2.dev',
];

/** A structurally valid, non-reserved-domain email address. */
export function generateValidEmail(seed: number): string {
  const rng = mulberry32(seed);
  return `${pick(rng, LOCALS)}@${pick(rng, DOMAINS)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known-valid E.164 numbers across plans and regions. Sources: numbers in
 * ranges reserved for fiction/drama (UK Ofcom 7946 09xx, US 555-01xx) and
 * carrier example shapes that satisfy libphonenumber's full-metadata
 * isValid(). The pool is itself pinned by a test, so a metadata update that
 * invalidates an entry fails loudly there rather than silently in the
 * property test.
 */
export const VALID_E164_POOL: readonly string[] = [
  '+12125550123', // US, NANP fictional range
  '+14155550198', // US
  '+442079460958', // UK, Ofcom drama range (London)
  '+447911123456', // UK mobile
  '+905321234567', // TR mobile
  '+4915123456789', // DE mobile
  '+33612345678', // FR mobile
  '+61412345678', // AU mobile
  '+819012345678', // JP mobile
  '+558121345678', // BR
  '+8613912345678', // CN mobile
  '+918527012345', // IN mobile
];

/** A valid phone number, formatted variably (E.164, spaced, punctuated). */
export function generateValidPhone(seed: number): string {
  const rng = mulberry32(seed);
  const e164 = pick(rng, VALID_E164_POOL);
  const style = int(rng, 0, 2);
  if (style === 0) return e164;
  const cc = e164.slice(0, e164.length - 10 >= 2 ? e164.length - 10 : 3);
  const rest = e164.slice(cc.length);
  if (style === 1) {
    // Space-grouped: +90 532 123 45 67 style.
    const parts: string[] = [];
    for (let i = 0; i < rest.length; i += 3) parts.push(rest.slice(i, i + 3));
    return `${cc} ${parts.join(' ')}`;
  }
  // Hyphen-grouped.
  const mid = Math.floor(rest.length / 2);
  return `${cc} ${rest.slice(0, mid)}-${rest.slice(mid)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// IP addresses
// ─────────────────────────────────────────────────────────────────────────────

/** A valid IPv4 address (octets 1–254 to stay clear of edge constants). */
export function generateValidIpv4(seed: number): string {
  const rng = mulberry32(seed);
  return [int(rng, 1, 223), int(rng, 0, 254), int(rng, 0, 254), int(rng, 1, 254)].join('.');
}

/** A valid IPv6 address, sometimes zero-compressed, never unspecified. */
export function generateValidIpv6(seed: number): string {
  const rng = mulberry32(seed);
  const groups: number[] = [];
  for (let i = 0; i < 8; i++) groups.push(int(rng, 0, 0xffff));
  if (groups[0] === 0) groups[0] = 0x2001; // never all-zero / leading-zero edge
  // Half the time, zero a run and write it compressed.
  if (rng() < 0.5) {
    const start = int(rng, 2, 5);
    const len = int(rng, 2, 3);
    for (let i = start; i < Math.min(start + len, 8); i++) groups[i] = 0;
    const hex = groups.map((g) => g.toString(16));
    return `${hex.slice(0, start).join(':')}::${hex.slice(Math.min(start + len, 8)).join(':')}`;
  }
  return groups.map((g) => g.toString(16)).join(':');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAC
// ─────────────────────────────────────────────────────────────────────────────

/** A valid MAC in colon, hyphen, or Cisco notation. Never all-00/all-ff. */
export function generateValidMac(seed: number): string {
  const rng = mulberry32(seed);
  const bytes: number[] = [];
  for (let i = 0; i < 6; i++) bytes.push(int(rng, 0, 255));
  bytes[2] = int(rng, 1, 254); // guarantees neither all-zero nor all-ff
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  const style = int(rng, 0, 2);
  if (style === 0) return hex.join(':');
  if (style === 1) return hex.join('-').toUpperCase();
  const h = hex.join('');
  return `${h.slice(0, 4)}.${h.slice(4, 8)}.${h.slice(8, 12)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL with credentials
// ─────────────────────────────────────────────────────────────────────────────

const CRED_USERS = ['admin', 'deploy', 'svc-backup', 'root', 'ci'];
const CRED_PASSWORDS = ['hunter2secret', 'P4ssw0rd!x', 'tOk3n-v4lue-9', 's3cr3t_key_77'];
const CRED_HOSTS = ['db.internal.corp', 'api.prod.net', 'cache.svc.local', 'build.ci.dev'];
const CRED_PARAMS = ['token', 'api_key', 'access_token', 'client_secret'];

/** A URL that genuinely carries a credential (userinfo or query form). */
export function generateValidCredentialUrl(seed: number): string {
  const rng = mulberry32(seed);
  if (rng() < 0.5) {
    return `https://${pick(rng, CRED_USERS)}:${pick(rng, CRED_PASSWORDS)}@${pick(rng, CRED_HOSTS)}/app`;
  }
  return `https://${pick(rng, CRED_HOSTS)}/v1/data?${pick(rng, CRED_PARAMS)}=Ab9${Math.floor(rng() * 1e12).toString(36)}xQ7tk`;
}
