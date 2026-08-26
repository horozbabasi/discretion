/**
 * The surrogate registry: given a detected entity, produce a same-shape
 * replacement value.
 *
 * SPEC.md, substitution: replace a value with "a realistic value of the same
 * type and shape" so the model reasons over coherent text, and for
 * identifiers "a value passing that country's checksum, so downstream
 * validation in the model's reasoning still behaves". We reuse the M2/M3
 * generators as the source — a surrogate IBAN needs exactly the checksum
 * validity a real one has, and that generator already exists.
 *
 * Two SPEC judgement calls, recorded in ARCHITECTURE.md D12:
 *
 *  • "Same country / same issuer." Honored where the detector's metadata
 *    carries it: IBAN → same country, CREDIT_CARD → same issuer, national
 *    identifiers → the SAME scheme's generator (a TCKN surrogate for a TCKN),
 *    VAT → same member state, crypto → same chain, IP → same version.
 *
 *  • "SECRET → a same-shape dummy that is clearly non-functional." The reused
 *    generators produce syntactically valid but RANDOM values (a JWT with a
 *    random signature, a PEM with a random body, a provider token with a
 *    random body) — non-functional because random, not because marked. That
 *    satisfies "non-functional"; if a visibly-marked dummy is later wanted it
 *    is a pool swap, not a structural change. Flagged, not silently resolved.
 *
 * `chooseSurrogate` returns `null` when no sensible surrogate exists for the
 * type — the masker then falls back to a bracket token and records it, per
 * SPEC.md's FALLBACK rule.
 */

import * as generate from '../generate/index.js';
import { detectScripts } from '../scripts.js';
import type { EntityType, ScriptName } from '../types.js';
import { PERSON_POOLS, DEFAULT_PERSON_POOL, ORG_POOL, LOCATION_POOL } from './surrogatePools.js';

const g = generate;

/** What the masker gives the registry about one detected value. */
export interface SurrogateRequest {
  readonly type: EntityType;
  /** The matched text (normalized). Used for shape and script inference. */
  readonly text: string;
  /** Detector metadata: scheme, country, issuer, chain, version, kind. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const meta = (req: SurrogateRequest, key: string): string | undefined => {
  const v = req.metadata?.[key];
  return typeof v === 'string' ? v : undefined;
};

/** National/tax/vat scheme → the generator that produces a valid instance. */
const SCHEME_GENERATORS: Readonly<Record<string, (seed: number) => string>> = {
  ssn: g.generateValidSsn, sin: g.generateValidSin, nino: g.generateValidNino, nhs: g.generateValidNhs,
  pps: g.generateValidPps, 'steuer-id': g.generateValidSteuerId, personalausweis: g.generateValidAusweis,
  nir: g.generateValidNir, dni: g.generateValidDni, nie: g.generateValidNie,
  'codice-fiscale': g.generateValidCodiceFiscale, bsn: g.generateValidBsn, rijksregister: g.generateValidBeRrn,
  pesel: g.generateValidPesel, nip: g.generateValidNip, regon: g.generateValidRegon,
  personnummer: g.generateValidPersonnummer, fodselsnummer: g.generateValidFodselsnummer, cpr: g.generateValidCpr,
  hetu: g.generateValidHetu, kennitala: g.generateValidKennitala, nif: g.generateValidPtNif, afm: g.generateValidAfm,
  'rodne-cislo': g.generateValidRodneCislo, 'szemelyi-szam': g.generateValidSzemelyi, cnp: g.generateValidCnp,
  egn: g.generateValidEgn, oib: g.generateValidOib, emso: g.generateValidEmso, tckn: g.generateValidTckn,
  vkn: g.generateValidVkn, inn: g.generateValidInn12, snils: g.generateValidSnils, rnokpp: g.generateValidRnokpp,
  iin: g.generateValidIin, 'teudat-zehut': g.generateValidTeudatZehut, 'saudi-id': g.generateValidSaudiId,
  'emirates-id': g.generateValidEmiratesId, qid: g.generateValidQid, 'civil-id': g.generateValidKwCivilId,
  aadhaar: g.generateValidAadhaar, pan: g.generateValidPan, ric: g.generateValidRic, 'tw-id': g.generateValidTwId,
  'my-number': g.generateValidMyNumber, rrn: g.generateValidKrRrn, nric: g.generateValidNric, hkid: g.generateValidHkid,
  cnic: g.generateValidCnic, nid: g.generateValidBdNid, mykad: g.generateValidMykad, nik: g.generateValidNik,
  'thai-id': g.generateValidThaiId, cccd: g.generateValidCccd, psn: g.generateValidPsn, tfn: g.generateValidTfn,
  medicare: g.generateValidMedicare, abn: g.generateValidAbn, ird: g.generateValidIrd, cpf: g.generateValidCpf,
  cnpj: g.generateValidCnpj, curp: g.generateValidCurp, rfc: g.generateValidRfc, cuit: g.generateValidCuit,
  rut: g.generateValidRut, nit: g.generateValidNit, 'za-id': g.generateValidZaId,
};

/** Bare-number schemes whose detector span is value-only but whose generator
 *  emits a label — produce the bare value directly. */
const BARE_VALUE_SCHEMES: Readonly<Record<string, (seed: number) => string>> = {
  cnie: (s) => {
    const rng = g.mulberry32(s);
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const prefix = rng() < 0.5 ? L[Math.floor(rng() * 26)]! : L[Math.floor(rng() * 26)]! + L[Math.floor(rng() * 26)]!;
    let d = '';
    for (let i = 0; i < 6; i++) d += Math.floor(rng() * 10);
    return `${prefix}${d}`;
  },
  nin: (s) => {
    const rng = g.mulberry32(s);
    let d = '';
    for (let i = 0; i < 11; i++) d += Math.floor(rng() * 10);
    return d;
  },
  'ke-id': (s) => {
    const rng = g.mulberry32(s);
    let d = '';
    for (let i = 0; i < 8; i++) d += Math.floor(rng() * 10);
    return d;
  },
  'ar-dni': (s) => {
    const rng = g.mulberry32(s);
    const n = 10_000_000 + Math.floor(rng() * 89_999_999);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },
  'pe-dni': (s) => {
    const rng = g.mulberry32(s);
    let d = '';
    for (let i = 0; i < 8; i++) d += Math.floor(rng() * 10);
    return d;
  },
  agencia: (s) => {
    const rng = g.mulberry32(s);
    let d = '';
    for (let i = 0; i < 4; i++) d += Math.floor(rng() * 10);
    return rng() < 0.4 ? `${d}-${Math.floor(rng() * 10)}` : d;
  },
};

/** Dominant script of the detected text, for PERSON surrogate matching. */
function scriptOf(text: string): ScriptName {
  return detectScripts(text).dominant ?? 'latin';
}

function personSurrogate(text: string, seed: number): string {
  const script = scriptOf(text);
  const pool = PERSON_POOLS.find((p) => p.script === script) ?? DEFAULT_PERSON_POOL;
  const rng = g.mulberry32(seed);
  const given = pool.given[Math.floor(rng() * pool.given.length)]!;
  const surname = pool.surnames[Math.floor(rng() * pool.surnames.length)]!;
  return pool.order === 'given-first' ? `${given}${pool.sep}${surname}` : `${surname}${pool.sep}${given}`;
}

/** A plausible ICD-10 code (letter + 2 digits + optional .subcode). */
function icd10Surrogate(seed: number): string {
  const rng = g.mulberry32(seed);
  const letters = 'ABCDEFGHIJKLMNOPRSTUVWXYZ';
  const head = `${letters[Math.floor(rng() * letters.length)]}${Math.floor(rng() * 10)}${Math.floor(rng() * 10)}`;
  return rng() < 0.6 ? `${head}.${Math.floor(rng() * 10)}` : head;
}

/**
 * Choose a surrogate for a detected entity. Returns the surrogate string, or
 * `null` when the type has no sensible surrogate (masker → bracket token).
 * `seed` varies across collision retries so a fresh value is produced.
 */
export function chooseSurrogate(req: SurrogateRequest, seed: number): string | null {
  switch (req.type) {
    case 'EMAIL':
      return g.generateValidEmail(seed);
    case 'PHONE':
      return g.generateValidPhone(seed);
    case 'IP_ADDRESS':
      return meta(req, 'version') === '6' || req.text.includes(':')
        ? g.generateValidIpv6(seed)
        : g.generateValidIpv4(seed);
    case 'MAC_ADDRESS':
      return g.generateValidMac(seed);
    case 'URL_WITH_CREDENTIALS':
      return g.generateValidCredentialUrl(seed);
    case 'CREDIT_CARD':
      return g.generateValidCardForIssuer(meta(req, 'issuer') ?? 'visa', seed);
    case 'IBAN': {
      const country = meta(req, 'country') ?? req.text.slice(0, 2).toUpperCase();
      return g.generateValidIbanForCountry(country, seed);
    }
    case 'SWIFT_BIC':
      return g.generateValidBic(seed);
    case 'US_ROUTING_NUMBER':
      return g.generateValidRouting(seed);
    case 'UK_SORT_CODE':
      return g.generateValidSortCode(seed);
    case 'CA_TRANSIT_NUMBER':
      return g.generateValidTransit(seed);
    case 'AU_BSB':
      return g.generateValidBsb(seed);
    case 'IN_IFSC':
      return g.generateValidIfsc(seed);
    case 'BR_AGENCIA':
      return BARE_VALUE_SCHEMES['agencia']!(seed);
    case 'CRYPTO_WALLET': {
      const chain = meta(req, 'chain');
      const byChain: Record<string, (s: number) => string> = {
        btc: g.generateValidBtc, eth: g.generateValidEth, ltc: g.generateValidLtc, trx: g.generateValidTrx,
        xmr: g.generateValidXmr, sol: g.generateValidSol, ada: g.generateValidAda, dot: g.generateValidDot,
      };
      return (chain !== undefined ? byChain[chain] : undefined)?.(seed) ?? g.generateValidBtc(seed);
    }
    case 'API_KEY':
      return g.generateValidProviderToken(seed);
    case 'JWT':
      return g.generateValidJwt(seed);
    case 'PRIVATE_KEY':
      return g.generateValidPem(seed);
    case 'GENERIC_SECRET':
      return g.generateHighEntropySecret(seed);
    case 'CONNECTION_STRING':
      return g.generateValidConnectionString(seed);
    case 'PASSPORT_MRZ':
      return g.generateValidTd3(seed);
    case 'DRIVERS_LICENSE':
      return g.generateValidDvla(seed);
    case 'VIN':
      return g.generateValidVin(seed);
    case 'US_NPI':
      return g.generateValidNpi(seed);
    case 'HEALTH_DATA': {
      const kind = meta(req, 'kind');
      if (kind === 'snomed') return g.generateValidSctid(seed);
      if (kind === 'lab-result') return g.generateValidLabResult(seed);
      if (kind === 'icd10') return icd10Surrogate(seed);
      return null; // bare-number SNOMED without kind, or an unmodeled shape
    }
    case 'POSTAL_CODE':
      return g.generateValidPostal(seed);
    case 'STREET_ADDRESS':
      return g.generateValidStreet(seed);
    case 'COORDINATES':
      return g.generateValidCoordinates(seed);
    case 'NATIONAL_ID':
    case 'TAX_ID': {
      const scheme = meta(req, 'scheme');
      if (scheme !== undefined) {
        const bare = BARE_VALUE_SCHEMES[scheme];
        if (bare !== undefined) return bare(seed);
        const gen = SCHEME_GENERATORS[scheme];
        if (gen !== undefined) return gen(seed);
      }
      return null; // unknown scheme → token
    }
    case 'VAT_NUMBER': {
      const country = meta(req, 'country') ?? req.text.slice(0, 2).toUpperCase();
      const c = country === 'GR' ? 'EL' : country;
      if (g.VAT_COUNTRIES.includes(c)) return g.generateValidVatFor(c, seed);
      return g.generateValidEuVat(seed);
    }
    case 'PERSON':
      return personSurrogate(req.text, seed);
    case 'ORG':
      return ORG_POOL[seed % ORG_POOL.length]!;
    case 'LOCATION':
      return LOCATION_POOL[seed % LOCATION_POOL.length]!;
    case 'DATE_OF_BIRTH':
      // Ordering-preserving date shifting needs a date detector (absent until
      // a later milestone) and a session offset; until then no surrogate,
      // so the masker uses a token. Recorded in ARCHITECTURE.md D12.
      return null;
    default:
      return null;
  }
}
