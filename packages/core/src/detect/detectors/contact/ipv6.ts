/**
 * IP_ADDRESS (IPv6) — full parse with compression, zone ids and v4-mapped
 * tails, plus scope classification.
 *
 * The candidate pattern is deliberately loose — hex-and-colon runs are easy
 * to over-match and hard to precisely match with one regex (compressed
 * forms, embedded IPv4, zones). Precision comes from `parseIpv6`, a strict
 * parser that either produces exactly eight 16-bit groups or rejects. Times
 * ("12:30:45"), MACs ("aa:bb:cc:dd:ee:ff") and C++ scope operators
 * ("std::vector") all fail the parse or the pattern's look-arounds.
 *
 * The all-zero address `::` is rejected outright rather than classified:
 * a bare double colon appears in too many non-address contexts to report.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

type Ipv6Scope =
  | 'global'
  | 'loopback'
  | 'link-local'
  | 'unique-local'
  | 'multicast'
  | 'documentation'
  | 'v4-mapped'
  | '6to4';

interface ParsedIpv6 {
  readonly groups: readonly number[];
  readonly zone?: string;
}

/** Strict parse to eight groups, or null. */
function parseIpv6(input: string): ParsedIpv6 | null {
  let s = input;
  let zone: string | undefined;

  const pct = s.indexOf('%');
  if (pct >= 0) {
    zone = s.slice(pct + 1);
    s = s.slice(0, pct);
    if (zone.length === 0) return null;
  }

  // Embedded IPv4 tail → two trailing hex groups.
  let v4Groups: number[] | null = null;
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':');
    if (lastColon < 0) return null;
    const tail = s.slice(lastColon + 1);
    const parts = tail.split('.');
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const v = Number(p);
      if (v > 255) return null;
      octets.push(v);
    }
    v4Groups = [(octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!];
    s = s.slice(0, lastColon + 1); // keep the colon: "::ffff:" stays parseable
  }

  const splitGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  let groups: number[];
  const compressionIndex = s.indexOf('::');
  if (compressionIndex >= 0) {
    if (s.indexOf('::', compressionIndex + 1) >= 0) return null; // two '::'
    let head = s.slice(0, compressionIndex);
    let tail = s.slice(compressionIndex + 2);
    if (head.endsWith(':')) head = head.slice(0, -1);
    if (tail.endsWith(':')) tail = tail.slice(0, -1);
    const headGroups = splitGroups(head);
    const tailGroups = splitGroups(tail);
    if (headGroups === null || tailGroups === null) return null;
    const tailAll = v4Groups === null ? tailGroups : [...tailGroups, ...v4Groups];
    const fixed = headGroups.length + tailAll.length;
    if (fixed > 7) return null; // '::' must compress at least one group
    groups = [...headGroups, ...new Array<number>(8 - fixed).fill(0), ...tailAll];
  } else {
    let body = s;
    if (v4Groups !== null) {
      if (!body.endsWith(':')) return null;
      body = body.slice(0, -1);
    }
    const parsed = splitGroups(body);
    if (parsed === null) return null;
    const all = v4Groups === null ? parsed : [...parsed, ...v4Groups];
    if (all.length !== 8) return null;
    groups = all;
  }

  return zone === undefined ? { groups } : { groups, zone };
}

function classify(g: readonly number[]): Ipv6Scope | 'unspecified' {
  if (g.every((x) => x === 0)) return 'unspecified';
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'loopback';
  const g0 = g[0]!;
  if ((g0 & 0xffc0) === 0xfe80) return 'link-local';
  if ((g0 & 0xfe00) === 0xfc00) return 'unique-local';
  if ((g0 & 0xff00) === 0xff00) return 'multicast';
  if (g0 === 0x2001 && g[1] === 0x0db8) return 'documentation';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return 'v4-mapped';
  if (g0 === 0x2002) return '6to4';
  return 'global';
}

/** RFC 5952 canonical text: lowercase hex, longest zero run compressed. */
function canonicalIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < 8) {
    if (groups[i] === 0) {
      let j = i;
      while (j < 8 && groups[j] === 0) j++;
      if (j - i > bestLen) {
        bestLen = j - i;
        bestStart = i;
      }
      i = j;
    } else {
      i++;
    }
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLen).join(':');
  return `${head}::${tail}`;
}

function validateIpv6(ctx: ValidationContext): ValidationResult {
  const parsed = parseIpv6(ctx.match[0]);
  if (parsed === null) return invalid('not a parseable IPv6 address');

  const scope = classify(parsed.groups);
  if (scope === 'unspecified') return invalid('unspecified address');

  const canonical = canonicalIpv6(parsed.groups);

  if (scope === 'documentation') {
    return valid({
      canonical,
      sensitive: false,
      confidence: CONFIDENCE.MEDIUM,
      metadata: { version: 6, scope },
      validator: 'ipv6-parse',
    });
  }
  const strong = scope === 'global' || scope === '6to4' || scope === 'v4-mapped';
  return valid({
    canonical,
    confidence: strong ? CONFIDENCE.HIGH : scope === 'multicast' ? CONFIDENCE.LOW : CONFIDENCE.MEDIUM,
    metadata: {
      version: 6,
      scope,
      ...(parsed.zone !== undefined ? { zone: parsed.zone } : {}),
    },
    validator: 'ipv6-parse',
  });
}

registerDetector({
  id: 'ip-v6',
  entityType: 'IP_ADDRESS',
  regions: [GLOBAL_REGION],
  // Loose harvest: needs a colon early (two colons total guaranteed by the
  // parser), hex/colon body, optional v4 tail and zone. Look-arounds keep it
  // out of words, times and scope operators.
  pattern:
    /(?<![\w:.])(?=[0-9A-Fa-f]{0,4}:[0-9A-Fa-f]{0,4}:)[0-9A-Fa-f:]{2,45}(?:\.\d{1,3}(?:\.\d{1,3}){2})?(?:%[0-9A-Za-z._~-]{1,16})?(?![\w:])/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'IPv6 addresses (compressed, zoned, v4-mapped) with strict parsing and scope classification.',
  validate: validateIpv6,
});
