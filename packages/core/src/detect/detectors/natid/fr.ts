/**
 * France: INSEE/NIR — 13 digits + 2-digit key, key = 97 − (number mod 97).
 *
 * Corsican departments write 2A/2B in the department field; for the modulo
 * the letter is replaced (2A→19, 2B→18 after subtracting from the numeric
 * reading — the standard rule: replace A with 0 and subtract 1,000,000;
 * B with 0 and subtract 2,000,000 — implemented via string substitution
 * then the documented offsets). Structure gates first: sex digit 1–8,
 * month 01–12 (or the 20+ pseudo-months INSEE uses for late registration).
 */

import { modString } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-fr-nir',
  entityType: 'NATIONAL_ID',
  regions: ['FR'],
  pattern: /\b([1-8])[ ]?(\d{2})[ ]?(\d{2})[ ]?(\d[0-9AB])[ ]?(\d{3})[ ]?(\d{3})[ ]?(\d{2})\b/gi,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'French NIR (INSEE) numbers with the mod-97 key, Corsica handled.',
  validate(ctx): ValidationResult {
    const [, sex, , month, dept, commune, order, key] = ctx.match as unknown as string[];
    const monthNum = Number(month);
    const validMonth = (monthNum >= 1 && monthNum <= 12) || (monthNum >= 20 && monthNum <= 42) || monthNum >= 50;
    if (!validMonth) return invalid('implausible month field');

    const deptUpper = dept!.toUpperCase();
    let thirteen = `${sex}${ctx.match[2]}${month}${deptUpper}${commune}${order}`;
    let offset = 0n;
    if (deptUpper.includes('A')) {
      thirteen = thirteen.replace('A', '0');
      offset = 1_000_000n;
    } else if (deptUpper.includes('B')) {
      thirteen = thirteen.replace('B', '0');
      offset = 2_000_000n;
    }
    if (!/^\d{13}$/.test(thirteen)) return invalid('malformed NIR body');

    // key = 97 − ((N − corsicaOffset) mod 97). The offset fits the rule
    // published by INSEE for 2A/2B departments.
    const n = BigInt(thirteen) - offset;
    const expected = 97n - (n % 97n);
    if (Number(expected) !== Number(key)) return invalid('mod-97 key failed');

    // modString cross-check for the common (non-Corsican) path keeps the
    // BigInt usage honest against the shared library.
    if (offset === 0n) {
      const viaLibrary = modString(thirteen, 97);
      if (viaLibrary === null || 97 - viaLibrary !== Number(expected)) {
        return invalid('internal checksum disagreement');
      }
    }

    return valid({
      canonical: `${thirteen.slice(0, 5)}${deptUpper}${commune}${order}${key}`.slice(0, 15),
      metadata: { scheme: 'nir', country: 'FR', sex: sex === '1' ? 'M' : sex === '2' ? 'F' : 'other' },
      validator: 'nir-mod97',
    });
  },
});
