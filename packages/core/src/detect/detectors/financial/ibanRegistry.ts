/**
 * The IBAN registry: per-country length and BBAN structure.
 *
 * SPEC.md: "IBAN — mod-97 checksum plus per-country length and structure
 * table covering all IBAN-registry countries."
 *
 * Structure is encoded as segments — "4a6n8c" reads: 4 letters, 6 digits,
 * 8 alphanumerics — with adjacent same-type runs merged from the official
 * SWIFT registry notation (4!a etc.). One encoding drives BOTH the
 * validator's regex and the test generator's synthesis, so they can never
 * drift apart. Segment types: n = 0-9, a = A-Z, c = A-Z0-9.
 *
 * Entries reflect the SWIFT IBAN Registry (release 98, 2024): 88 countries
 * and territories. Countries using another state's IBAN (Åland → FI, the
 * French overseas collectivities → FR) are covered by that state's entry.
 */

export interface IbanSegment {
  readonly type: 'n' | 'a' | 'c';
  readonly length: number;
}

export interface IbanSpec {
  /** Total IBAN length including country code and check digits. */
  readonly length: number;
  readonly segments: readonly IbanSegment[];
  /** Compiled BBAN validation regex (anchored). */
  readonly bban: RegExp;
}

const SEGMENT_CLASS: Record<IbanSegment['type'], string> = {
  n: '[0-9]',
  a: '[A-Z]',
  c: '[A-Z0-9]',
};

function parseSegments(encoded: string): IbanSegment[] {
  const out: IbanSegment[] = [];
  const re = /(\d+)([nac])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(encoded)) !== null) {
    out.push({ type: m[2] as IbanSegment['type'], length: Number(m[1]) });
  }
  return out;
}

function buildSpec(length: number, encoded: string): IbanSpec {
  const segments = parseSegments(encoded);
  const bbanLength = segments.reduce((sum, s) => sum + s.length, 0);
  if (bbanLength !== length - 4) {
    // Impossible unless the table below is mistyped; fail at module load.
    throw new Error(`IBAN registry entry inconsistent: ${encoded} for length ${length}`);
  }
  const source = `^${segments.map((s) => `${SEGMENT_CLASS[s.type]}{${s.length}}`).join('')}$`;
  return { length, segments, bban: new RegExp(source) };
}

/** country code → [total length, BBAN segment encoding]. */
const RAW: Readonly<Record<string, readonly [number, string]>> = {
  AD: [24, '8n12c'], AE: [23, '19n'], AL: [28, '8n16c'], AT: [20, '16n'],
  AZ: [28, '4a20c'], BA: [20, '16n'], BE: [16, '12n'], BG: [22, '4a6n8c'],
  BH: [22, '4a14c'], BI: [27, '23n'], BR: [29, '23n1a1c'], BY: [28, '4c4n16c'],
  CH: [21, '5n12c'], CR: [22, '18n'], CY: [28, '8n16c'], CZ: [24, '20n'],
  DE: [22, '18n'], DJ: [27, '23n'], DK: [18, '14n'], DO: [28, '4c20n'],
  EE: [20, '16n'], EG: [29, '25n'], ES: [24, '20n'], FI: [18, '14n'],
  FK: [18, '2a12n'], FO: [18, '14n'], FR: [27, '10n11c2n'], GB: [22, '4a14n'],
  GE: [22, '2a16n'], GI: [23, '4a15c'], GL: [18, '14n'], GR: [27, '7n16c'],
  GT: [28, '4c20c'], HN: [28, '4a20n'], HR: [21, '17n'], HU: [28, '24n'],
  IE: [22, '4a14n'], IL: [23, '19n'], IQ: [23, '4a15n'], IS: [26, '22n'],
  IT: [27, '1a10n12c'], JO: [30, '4a4n18c'], KW: [30, '4a22c'], KZ: [20, '3n13c'],
  LB: [28, '4n20c'], LC: [32, '4a24c'], LI: [21, '5n12c'], LT: [20, '16n'],
  LU: [20, '3n13c'], LV: [21, '4a13c'], LY: [25, '21n'], MC: [27, '10n11c2n'],
  MD: [24, '20c'], ME: [22, '18n'], MK: [19, '3n10c2n'], MN: [20, '16n'],
  MR: [27, '23n'], MT: [31, '4a5n18c'], MU: [30, '4a19n3a'], NI: [28, '4a20n'],
  NL: [18, '4a10n'], NO: [15, '11n'], OM: [23, '3n16c'], PK: [24, '4a16c'],
  PL: [28, '24n'], PS: [29, '4a21c'], PT: [25, '21n'], QA: [29, '4a21c'],
  RO: [24, '4a16c'], RS: [22, '18n'], RU: [33, '14n15c'], SA: [24, '2n18c'],
  SC: [31, '4a20n3a'], SD: [18, '14n'], SE: [24, '20n'], SI: [19, '15n'],
  SK: [24, '20n'], SM: [27, '1a10n12c'], SO: [23, '19n'], ST: [25, '21n'],
  SV: [28, '4a20n'], TL: [23, '19n'], TN: [24, '20n'], TR: [26, '5n17c'],
  UA: [29, '6n19c'], VA: [22, '18n'], VG: [24, '4a16n'], XK: [20, '16n'],
};

/** The compiled registry, one spec per IBAN country. */
export const IBAN_REGISTRY: ReadonlyMap<string, IbanSpec> = new Map(
  Object.entries(RAW).map(([code, [length, encoded]]) => [code, buildSpec(length, encoded)]),
);

/**
 * IBANs published as documentation specimens (SWIFT registry examples and
 * the ubiquitous tutorial values). Detected, classified non-sensitive.
 */
export const DOCUMENTATION_IBANS: ReadonlySet<string> = new Set([
  'GB82WEST12345698765432',
  'GB29NWBK60161331926819',
  'DE89370400440532013000',
  'DE75512108001245126199',
  'FR1420041010050500013M02606',
  'FR7630006000011234567890189',
  'NL91ABNA0417164300',
  'BE68539007547034',
  'ES9121000418450200051332',
  'IT60X0542811101000000123456',
  'CH9300762011623852957',
  'AT611904300234573201',
  'TR330006100519786457841326',
  'PL61109010140000071219812874',
  'SE4550000000058398257466',
  'DK5000400440116243',
  'NO9386011117947',
  'FI2112345600000785',
]);
