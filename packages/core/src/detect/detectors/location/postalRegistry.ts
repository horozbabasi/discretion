/**
 * Per-country postal code formats.
 *
 * SPEC.md: "per-country format table covering all countries with postal
 * systems, low base confidence, requires context boost." This table is the
 * format half; the LOW cap comes from the detector's requiresContext flag.
 *
 * Countries sharing a bare digit-count share a regex constant; countries
 * with real internal structure (UK, CA, NL, PL, PT, BR, JP, IE, MT…) get
 * their own, and where the structure encodes genuine rules — Canada's
 * excluded letters, the UK outward/inward split — those rules are in the
 * regex, not commentary. Countries without an operating postal-code system
 * (e.g. AE, HK, PA at the street level, many Caribbean and African states)
 * are deliberately absent; absence here is a statement, not an omission.
 */

const D3 = /^\d{3}$/; // IS, PG (also FO)
const D4 = /^\d{4}$/;
const D5 = /^\d{5}$/;
const D6 = /^\d{6}$/;
const D7 = /^\d{7}$/;
const D3_SP_D2 = /^\d{3} ?\d{2}$/; // CZ, SK, SE, GR

export const POSTAL_FORMATS: Readonly<Record<string, RegExp>> = {
  // ── structured formats ──
  GB: /^(?:GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/, // outward + inward
  // First letter excludes D F I O Q U W Z; later letters exclude D F I O Q U.
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/,
  NL: /^\d{4} ?[A-Z]{2}$/,
  PL: /^\d{2}-\d{3}$/,
  PT: /^\d{4}-\d{3}$/,
  BR: /^\d{5}-?\d{3}$/,
  JP: /^\d{3}-?\d{4}$/,
  US: /^\d{5}(?:-\d{4})?$/,
  IE: /^[A-Z]\d{2} ?[A-Z0-9]{4}$|^D6W ?[A-Z0-9]{4}$/, // Eircode
  MT: /^[A-Z]{3} ?\d{4}$/,
  AZ: /^AZ ?\d{4}$/,
  AD: /^AD\d{3}$/,
  BB: /^BB\d{5}$/,
  MD: /^MD-?\d{4}$/,
  LV: /^LV-?\d{4}$/,
  LT: /^LT-?\d{5}$/,
  MC: /^980\d{2}$/,
  SM: /^4789\d$/,
  VA: /^00120$/,
  GR: D3_SP_D2, CZ: D3_SP_D2, SK: D3_SP_D2, SE: D3_SP_D2,
  KY: /^KY\d-\d{4}$/,
  BM: /^[A-Z]{2} ?\d{2}$/,
  // ── plain digit counts ──
  IS: D3, PG: D3, FO: D3,
  AT: D4, AU: D4, BE: D4, BG: D4, CH: D4, CY: D4, DK: D4, HU: D4, LI: D4,
  LU: D4, MK: D4, NO: D4, NZ: D4, PH: D4, SI: D4, ZA: D4, AL: D4, BD: D4,
  CV: D4, ET: D4, GE: D4, PY: D4, SV: D4, TN: D4, AM: D4, NE: D4, SJ: D4,
  DE: D5, FR: D5, ES: D5, IT: D5, FI: D5, TR: D5, TH: D5, MY: D5, MX: D5,
  ID: D5, PK: D5, EG: D5, DZ: D5, MA: D5, KE: D5, JO: D5, IQ: D5, KW: D5,
  LK: D5, MN: D5, UA: D5, UZ: D5, HR: D5, EE: D5, RS: D5, ME: D5, BA: D5,
  CU: D5, DO: D5, GT: D5, HN: D5, NI: D5, CR: D5, PE: D5, KR: D5, SA: D5,
  SD: D5, ZM: D5, MZ: D4, TZ: D5, UY: D5, MM: D5, KH: D5, LA: D5, NP: D5,
  BT: D5, MV: D5, SN: D5, GN: D6,
  CN: D6, IN: D6, SG: D6, RU: D6, KZ: D6, BY: D6, NG: D6, RO: D6, KG: D6,
  TJ: D6, TM: D6, VN: D6, EC: D6,
  IL: D7, CL: D7,
  TW: /^\d{3}(?:-?\d{2,3})?$/,
  AR: /^[A-Z]?\d{4}[A-Z]{0,3}$/, // CPA: letter + 4 digits + 3 letters, or legacy 4
};

/** Every country whose format the candidate satisfies. */
export function postalCountriesFor(candidate: string): string[] {
  const out: string[] = [];
  for (const [country, format] of Object.entries(POSTAL_FORMATS)) {
    if (format.test(candidate)) out.push(country);
  }
  return out;
}
