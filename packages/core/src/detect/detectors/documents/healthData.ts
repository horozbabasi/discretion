/**
 * HEALTH_DATA — ICD-10/ICD-11 codes, SNOMED CT identifiers, and lab-result
 * patterns.
 *
 * SPEC.md: "classify as HEALTH_DATA, off by default, on in Strict profile."
 * The profile switch is Stage 4's job; here the candidates are emitted with
 * correct confidence and rich metadata so the profile can gate them.
 *
 * Three sub-shapes, one detector:
 *   • ICD-10: letter + 2 digits + optional '.' + 1–4 alphanumerics
 *     ("E11.9", "S72.001A"). Distinctive only with the dot or in a labeled
 *     context, so undotted 3-char codes ("E11") are NOT matched — "B12" is
 *     a vitamin far more often than a diagnosis.
 *   • SNOMED CT: 6–18 digit SCTID whose structure is checkable — the LAST
 *     digit is a Verhoeff check digit over the preceding digits (that is
 *     what SNOMED actually uses: Verhoeff, not Luhn), and the two digits
 *     before it (the partition identifier) must be a defined pair.
 *   • Lab results: value + unit + reference range ("HbA1c 9.1 % (4.0–5.6)",
 *     "Glucose 182 mg/dL [70-99]"). The unit and range together are the
 *     signal; a bare number is nothing.
 */

import { verhoeffValid } from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

/** Defined SNOMED CT partition identifiers (digits n-2..n-1 of an SCTID). */
const SNOMED_PARTITIONS = new Set(['00', '01', '02', '03', '04', '05', '10', '11', '12', '13', '14', '15']);

const ICD10 = /^[A-TV-Z]\d{2}\.[A-Z0-9]{1,4}$/;

const LAB_UNITS =
  /(?:mg\/dL|mmol\/L|g\/dL|IU\/L|U\/L|ng\/mL|pg\/mL|µg\/L|ug\/L|mIU\/L|µIU\/mL|uIU\/mL|%|mEq\/L|k\/µL|K\/uL|x10[³3]\/µL|fL|pg)/;

function validateHealth(ctx: ValidationContext): ValidationResult {
  const value = ctx.match[0];

  // ICD-10 with the dot: structure alone is distinctive.
  if (ICD10.test(value)) {
    return valid({
      canonical: value,
      confidence: CONFIDENCE.MEDIUM,
      metadata: { kind: 'icd10' },
      validator: 'icd10-structure',
    });
  }

  // SNOMED SCTID: partition pair defined AND Verhoeff closes.
  if (/^\d{6,18}$/.test(value)) {
    const partition = value.slice(-3, -1);
    if (!SNOMED_PARTITIONS.has(partition)) return invalid('undefined SCTID partition');
    if (!verhoeffValid(value)) return invalid('SCTID Verhoeff check failed');
    return valid({
      canonical: value,
      confidence: CONFIDENCE.MEDIUM,
      metadata: { kind: 'snomed', partition },
      validator: 'sctid-verhoeff',
    });
  }

  // Lab result: value + unit (+ optional bracketed/parenthesised range).
  if (LAB_UNITS.test(value) && /\d/.test(value)) {
    const hasRange = /[[(].*\d.*[-–].*\d.*[\])]/.test(value);
    return valid({
      confidence: hasRange ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
      metadata: { kind: 'lab-result', hasRange },
      validator: 'lab-pattern',
    });
  }

  return invalid('no health-data shape matched');
}

registerDetector({
  id: 'health-data',
  entityType: 'HEALTH_DATA',
  regions: [GLOBAL_REGION],
  // ICD-10 dotted codes; SCTID digit runs (validated hard); measurement +
  // unit with optional reference range. Ends with (?!\w), not \b: a match
  // ending in '%' or ']' has no word boundary before a following space, so
  // \b would silently kill every percent-unit lab value.
  pattern:
    /\b(?:[A-TV-Z]\d{2}\.[A-Z0-9]{1,4}|\d{6,18}|\d+(?:\.\d+)?\s?(?:mg\/dL|mmol\/L|g\/dL|IU\/L|U\/L|ng\/mL|pg\/mL|µg\/L|ug\/L|mIU\/L|µIU\/mL|uIU\/mL|%|mEq\/L|k\/µL|K\/uL|fL)\s?(?:[[(]\s?\d+(?:\.\d+)?\s?[-–]\s?\d+(?:\.\d+)?\s?[\])])?)(?!\w)/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Health data: dotted ICD-10 codes, Verhoeff-checked SNOMED ids, lab values with units/ranges.',
  validate: validateHealth,
});
