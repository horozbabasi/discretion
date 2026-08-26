/**
 * South and Southeast Asia: Pakistan, Bangladesh, Malaysia, Indonesia,
 * Thailand, Vietnam, Philippines.
 *
 * Only Thailand's national ID carries a public checksum (weights 13..2,
 * check = (11 − sum mod 11) mod 10) → HIGH. The rest validate published
 * STRUCTURE — hyphenation, date fields, province/place codes — at MEDIUM,
 * each stating what is and is not checkable:
 *  • PK CNIC 5-7-1 hyphenated; final digit encodes gender.
 *  • BD NID: only the 17-digit form (leading birth year) is claimed; the
 *    10- and 13-digit forms are bare digit runs and are left to Stage 3.
 *  • MY MyKad YYMMDD-PB-###G with the place-of-birth code gate (00 and
 *    17–20 unassigned).
 *  • ID NIK: province 11–94, DDMMYY with the +40 female day offset.
 *  • VN CCCD: twelve digits, province 001–096, century digit.
 *  • PH PhilSys PCN: sixteen digits in 4-4-4-4 only.
 */

import { toDigits, weightedModBy } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationResult } from '../../types.js';

registerDetector({
  id: 'national-id-pk-cnic',
  entityType: 'NATIONAL_ID',
  regions: ['PK'],
  pattern: /\b([1-9]\d{4})-(\d{7})-(\d)\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Pakistani CNIC in its hyphenated writing (no public checksum).',
  validate(ctx): ValidationResult {
    return valid({
      canonical: `${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}`,
      metadata: { scheme: 'cnic', country: 'PK', male: Number(ctx.match[3]) % 2 === 1 },
      validator: 'cnic-structure',
    });
  },
});

registerDetector({
  id: 'national-id-bd-nid',
  entityType: 'NATIONAL_ID',
  regions: ['BD'],
  pattern: /\b(19\d{2}|20\d{2})\d{13}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Bangladeshi 17-digit NID (birth-year prefix); shorter forms left to context.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after)) return invalid('fragment of a longer number');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'nid', country: 'BD' },
      validator: 'nid-structure',
    });
  },
});

registerDetector({
  id: 'national-id-my-mykad',
  entityType: 'NATIONAL_ID',
  regions: ['MY'],
  pattern: /\b(\d{2})(\d{2})(\d{2})-(\d{2})-(\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Malaysian MyKad: birth date plus place-of-birth code gate (no checksum).',
  validate(ctx): ValidationResult {
    const month = Number(ctx.match[2]);
    if (month < 1 || month > 12) return invalid('month out of range');
    const day = Number(ctx.match[3]);
    if (day < 1 || day > 31) return invalid('day out of range');
    const pb = Number(ctx.match[4]);
    if (pb === 0 || (pb >= 17 && pb <= 20)) return invalid('unassigned place-of-birth code');
    return valid({
      canonical: ctx.match[0].replace(/-/g, ''),
      metadata: { scheme: 'mykad', country: 'MY' },
      validator: 'mykad-structure',
    });
  },
});

registerDetector({
  id: 'national-id-id-nik',
  entityType: 'NATIONAL_ID',
  regions: ['ID'],
  pattern: /\b([1-9]\d)(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Indonesian NIK: province and date structure with the +40 female offset.',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after)) return invalid('fragment of a longer number');

    const province = Number(ctx.match[1]);
    if (province < 11 || province > 94) return invalid('province out of range');
    const day = Number(ctx.match[4]);
    const female = day >= 41 && day <= 71;
    if (!(day >= 1 && day <= 31) && !female) return invalid('day out of range');
    const month = Number(ctx.match[5]);
    if (month < 1 || month > 12) return invalid('month out of range');
    if (ctx.match[7] === '0000') return invalid('serial 0000 never issued');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'nik', country: 'ID', female },
      validator: 'nik-structure',
    });
  },
});

registerDetector({
  id: 'national-id-th',
  entityType: 'NATIONAL_ID',
  regions: ['TH'],
  pattern: /\b([1-8])[ -]?(\d{4})[ -]?(\d{5})[ -]?(\d{2})[ -]?(\d)\b/g,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Thai National ID with the descending-weight mod-11 check.',
  validate(ctx): ValidationResult {
    const digits = toDigits(`${ctx.match[1]}${ctx.match[2]}${ctx.match[3]}${ctx.match[4]}${ctx.match[5]}`)!;
    const remainder = weightedModBy(digits.slice(0, 12), (i) => 13 - i, 11)!;
    const check = (11 - remainder) % 10;
    if (check !== digits[12]) return invalid('Thai ID check failed');
    return valid({
      canonical: digits.join(''),
      metadata: { scheme: 'thai-id', country: 'TH' },
      validator: 'thai-mod11',
    });
  },
});

registerDetector({
  id: 'national-id-vn-cccd',
  entityType: 'NATIONAL_ID',
  regions: ['VN'],
  pattern: /\b(0\d{2})(\d)(\d{2})(\d{6})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Vietnamese CCCD: province 001-096 and century digit (no public checksum).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after)) return invalid('fragment of a longer number');

    const province = Number(ctx.match[1]);
    if (province < 1 || province > 96) return invalid('province out of range');
    return valid({
      canonical: ctx.match[0],
      metadata: { scheme: 'cccd', country: 'VN' },
      validator: 'cccd-structure',
    });
  },
});

registerDetector({
  id: 'national-id-ph-psn',
  entityType: 'NATIONAL_ID',
  regions: ['PH'],
  pattern: /\b(\d{4})-(\d{4})-(\d{4})-(\d{4})\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Philippine PhilSys card number in its 4-4-4-4 writing (no public checksum).',
  validate(ctx): ValidationResult {
    const before = ctx.start > 0 ? ctx.text[ctx.start - 1] : '';
    if (/[\d-]/.test(before ?? '')) return invalid('fragment of a longer number');
    const after = ctx.text.slice(ctx.end, ctx.end + 2);
    if (/^\d/.test(after) || /^-\d/.test(after)) return invalid('fragment of a longer number');
    const all = ctx.match[0].replace(/-/g, '');
    if (/^(.)\1+$/.test(all)) return invalid('repdigit');
    return valid({
      canonical: all,
      metadata: { scheme: 'psn', country: 'PH' },
      validator: 'psn-structure',
    });
  },
});
