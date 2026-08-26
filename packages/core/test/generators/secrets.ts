/**
 * Valid-value generators for the secrets family.
 *
 * The provider tokens have no universal checksum except GitHub's, so most
 * generators synthesize a shape the validator accepts; the GitHub generator
 * computes a real CRC32 so its output passes the checksum gate (and a
 * mutation of the random body fails it). JWT synthesis builds a real
 * base64url header with a valid alg. GENERIC_SECRET is context-gated, so its
 * generator produces high-entropy strings the entropy half accepts.
 */

import { mulberry32 } from '../helpers.js';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const HEX = '0123456789abcdef';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function chars(rng: () => number, alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(rng() * alphabet.length)]!;
  return out;
}

// ── GitHub token with a real CRC32 checksum ──

function crc32(s: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i);
    for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function githubCheck(random: string): string {
  let value = crc32(random);
  let encoded = '';
  for (let i = 0; i < 6; i++) {
    encoded = BASE62[value % 62]! + encoded;
    value = Math.floor(value / 62);
  }
  return encoded;
}

/** A GitHub PAT (ghp_) whose CRC32 checksum is correct. */
export function generateValidGithubToken(seed: number): string {
  const rng = mulberry32(seed);
  const random = chars(rng, BASE62, 30);
  return `ghp_${random}${githubCheck(random)}`;
}

/** A non-GitHub provider token that satisfies its shape entry. */
export function generateValidProviderToken(seed: number): string {
  const rng = mulberry32(seed);
  const shapes: readonly (() => string)[] = [
    () => `sk-${chars(rng, BASE62, 48)}`, // OpenAI
    () => `AIza${chars(rng, B64URL, 35)}`, // Google
    () => `AKIA${chars(rng, BASE62, 16)}`, // AWS
    () => `glpat-${chars(rng, B64URL, 20)}`, // GitLab
    () => `xoxb-${chars(rng, BASE62, 24)}`, // Slack
    () => `sk_live_${chars(rng, BASE62, 24)}`, // Stripe
    () => `SK${chars(rng, HEX, 32)}`, // Twilio
    () => `npm_${chars(rng, BASE62, 36)}`, // npm
    () => `hf_${chars(rng, BASE62, 34)}`, // Hugging Face
  ];
  return pick(rng, shapes)();
}

// ── JWT ──

function b64url(s: string): string {
  const chars64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    acc = (acc << 8) | s.charCodeAt(i);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += chars64[(acc >> bits) & 0x3f]!;
    }
  }
  if (bits > 0) out += chars64[(acc << (6 - bits)) & 0x3f]!;
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

const JWT_ALGS = ['HS256', 'RS256', 'ES256', 'PS384', 'EdDSA'];

/** A structurally valid JWT with a real header carrying a valid alg. */
export function generateValidJwt(seed: number): string {
  const rng = mulberry32(seed);
  const alg = pick(rng, JWT_ALGS);
  const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: chars(rng, BASE62, 8), iat: 1_600_000_000 + Math.floor(rng() * 1e7) }));
  const signature = chars(rng, B64URL, 43);
  return `${header}.${payload}.${signature}`;
}

// ── PEM ──

/** A PEM private-key block with matching armor labels and base64 body. */
export function generateValidPem(seed: number): string {
  const rng = mulberry32(seed);
  const label = pick(rng, ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'OPENSSH PRIVATE KEY']);
  const lines: string[] = [];
  const lineCount = 4 + Math.floor(rng() * 6);
  for (let i = 0; i < lineCount; i++) lines.push(chars(rng, `${BASE62}+/`, 64));
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

// ── Connection strings ──

const DB_SCHEMES = ['postgres', 'mysql', 'mongodb', 'redis', 'mongodb+srv', 'mariadb', 'amqp'];

/** A database connection URI with a password in userinfo. */
export function generateValidConnectionString(seed: number): string {
  const rng = mulberry32(seed);
  const scheme = pick(rng, DB_SCHEMES);
  const user = pick(rng, ['app', 'admin', 'svc', 'root']);
  const pass = chars(rng, BASE62, 12 + Math.floor(rng() * 8));
  const host = pick(rng, ['db.internal', 'prod-db.corp', 'cluster0.mongodb.net', '10.0.3.4']);
  return `${scheme}://${user}:${pass}@${host}:5432/appdb`;
}

// ── Generic secret (high-entropy) ──

/** A high-entropy mixed-class token the entropy gate accepts. */
export function generateHighEntropySecret(seed: number): string {
  const rng = mulberry32(seed);
  const len = 24 + Math.floor(rng() * 24);
  // Guarantee at least two character classes and high diversity.
  let out = chars(rng, `${BASE62}-_`, len);
  // Force a digit and a letter to be present.
  out = `A9${out.slice(2)}`;
  return out;
}
