/**
 * The entity bank: every M2 generator wrapped as a corpus entity kind.
 *
 * Per the milestone instruction, NO new generation logic — each entry
 * delegates to the paired generator promoted to core's public API in E1.
 * `languages` is an affinity list: national schemes appear mostly in
 * documents of their own language (a TCKN in Turkish text), with a minority
 * planted elsewhere (the foreign-colleague scenario the detectors must
 * still catch). `placement` distinguishes inline values from multi-line
 * blocks (PEM, MRZ) that only some document types can host.
 */

import { generate } from '@privacyshield/core';
import type { EntityType } from '@privacyshield/core';

export interface EntityKind {
  readonly kind: string;
  readonly type: EntityType;
  readonly generate: (seed: number) => string;
  /** Language affinity; undefined = global. */
  readonly languages?: readonly string[];
  readonly placement: 'inline' | 'block';
  /** Sampling weight (default 1). Secrets are up-weighted per SPEC's
   *  "highest priority for developer users". */
  readonly weight?: number;
  /**
   * For LABELED kinds whose generator emits "label value" but whose
   * detector narrows the span to the value alone (agência, AR/PE DNI, NIN,
   * KE ID, CNIE): the ground-truth span covers only this pattern's match
   * within the generated string, keeping GT aligned with what a correct
   * detector reports.
   */
  readonly valuePattern?: RegExp;
}

const g = generate;

export const ENTITY_BANK: readonly EntityKind[] = [
  // ── contact & network (global) ──
  { kind: 'email', type: 'EMAIL', generate: g.generateValidEmail, placement: 'inline', weight: 3 },
  { kind: 'phone', type: 'PHONE', generate: g.generateValidPhone, placement: 'inline', weight: 3 },
  { kind: 'ipv4', type: 'IP_ADDRESS', generate: g.generateValidIpv4, placement: 'inline', weight: 2 },
  { kind: 'ipv6', type: 'IP_ADDRESS', generate: g.generateValidIpv6, placement: 'inline' },
  { kind: 'mac', type: 'MAC_ADDRESS', generate: g.generateValidMac, placement: 'inline' },
  { kind: 'cred-url', type: 'URL_WITH_CREDENTIALS', generate: g.generateValidCredentialUrl, placement: 'inline' },
  // ── financial (global) ──
  { kind: 'card', type: 'CREDIT_CARD', generate: g.generateValidCard, placement: 'inline', weight: 2 },
  { kind: 'iban', type: 'IBAN', generate: g.generateValidIban, placement: 'inline', weight: 2 },
  { kind: 'bic', type: 'SWIFT_BIC', generate: g.generateValidBic, placement: 'inline' },
  // ── bank codes (regional) ──
  { kind: 'us-routing', type: 'US_ROUTING_NUMBER', generate: g.generateValidRouting, languages: ['en'], placement: 'inline' },
  { kind: 'uk-sort', type: 'UK_SORT_CODE', generate: g.generateValidSortCode, languages: ['en'], placement: 'inline' },
  { kind: 'ca-transit', type: 'CA_TRANSIT_NUMBER', generate: g.generateValidTransit, languages: ['en', 'fr'], placement: 'inline' },
  { kind: 'au-bsb', type: 'AU_BSB', generate: g.generateValidBsb, languages: ['en'], placement: 'inline' },
  { kind: 'in-ifsc', type: 'IN_IFSC', generate: g.generateValidIfsc, languages: ['hi', 'en'], placement: 'inline' },
  { kind: 'br-agencia', type: 'BR_AGENCIA', generate: g.generateValidAgencia, languages: ['pt'], placement: 'inline', valuePattern: /\d{4}(?:-\d)?$/ },
  // ── crypto (global) ──
  { kind: 'btc', type: 'CRYPTO_WALLET', generate: g.generateValidBtc, placement: 'inline' },
  { kind: 'eth', type: 'CRYPTO_WALLET', generate: g.generateValidEth, placement: 'inline' },
  { kind: 'ltc', type: 'CRYPTO_WALLET', generate: g.generateValidLtc, placement: 'inline' },
  { kind: 'trx', type: 'CRYPTO_WALLET', generate: g.generateValidTrx, placement: 'inline' },
  { kind: 'xmr', type: 'CRYPTO_WALLET', generate: g.generateValidXmr, placement: 'inline' },
  { kind: 'sol', type: 'CRYPTO_WALLET', generate: g.generateValidSol, placement: 'inline' },
  { kind: 'ada', type: 'CRYPTO_WALLET', generate: g.generateValidAda, placement: 'inline' },
  { kind: 'dot', type: 'CRYPTO_WALLET', generate: g.generateValidDot, placement: 'inline' },
  // ── secrets (global; up-weighted per SPEC) ──
  { kind: 'github-token', type: 'API_KEY', generate: g.generateValidGithubToken, placement: 'inline', weight: 3 },
  { kind: 'provider-token', type: 'API_KEY', generate: g.generateValidProviderToken, placement: 'inline', weight: 3 },
  { kind: 'jwt', type: 'JWT', generate: g.generateValidJwt, placement: 'inline', weight: 2 },
  { kind: 'pem', type: 'PRIVATE_KEY', generate: g.generateValidPem, placement: 'block', weight: 2 },
  { kind: 'connection-string', type: 'CONNECTION_STRING', generate: g.generateValidConnectionString, placement: 'inline', weight: 2 },
  { kind: 'generic-secret', type: 'GENERIC_SECRET', generate: g.generateHighEntropySecret, placement: 'inline' },
  // ── documents & health ──
  { kind: 'mrz-td3', type: 'PASSPORT_MRZ', generate: g.generateValidTd3, placement: 'block' },
  { kind: 'mrz-td1', type: 'PASSPORT_MRZ', generate: g.generateValidTd1, placement: 'block' },
  { kind: 'vin', type: 'VIN', generate: g.generateValidVin, placement: 'inline' },
  { kind: 'npi', type: 'US_NPI', generate: g.generateValidNpi, languages: ['en'], placement: 'inline' },
  { kind: 'dvla', type: 'DRIVERS_LICENSE', generate: g.generateValidDvla, languages: ['en'], placement: 'inline' },
  { kind: 'sctid', type: 'HEALTH_DATA', generate: g.generateValidSctid, placement: 'inline' },
  { kind: 'lab-result', type: 'HEALTH_DATA', generate: g.generateValidLabResult, placement: 'inline' },
  // ── location (context-dependent; still ground truth) ──
  { kind: 'postal', type: 'POSTAL_CODE', generate: g.generateValidPostal, placement: 'inline' },
  { kind: 'street', type: 'STREET_ADDRESS', generate: g.generateValidStreet, placement: 'inline' },
  { kind: 'coords', type: 'COORDINATES', generate: g.generateValidCoordinates, placement: 'inline' },
  // ── national identifiers (language-affine) ──
  { kind: 'ssn', type: 'NATIONAL_ID', generate: g.generateValidSsn, languages: ['en'], placement: 'inline' },
  { kind: 'sin', type: 'NATIONAL_ID', generate: g.generateValidSin, languages: ['en', 'fr'], placement: 'inline' },
  { kind: 'nino', type: 'NATIONAL_ID', generate: g.generateValidNino, languages: ['en'], placement: 'inline' },
  { kind: 'nhs', type: 'NATIONAL_ID', generate: g.generateValidNhs, languages: ['en'], placement: 'inline' },
  { kind: 'pps', type: 'NATIONAL_ID', generate: g.generateValidPps, languages: ['en'], placement: 'inline' },
  { kind: 'steuer-id', type: 'TAX_ID', generate: g.generateValidSteuerId, languages: ['de'], placement: 'inline' },
  { kind: 'ausweis', type: 'NATIONAL_ID', generate: g.generateValidAusweis, languages: ['de'], placement: 'inline' },
  { kind: 'nir', type: 'NATIONAL_ID', generate: g.generateValidNir, languages: ['fr'], placement: 'inline' },
  { kind: 'dni-es', type: 'NATIONAL_ID', generate: g.generateValidDni, languages: ['es'], placement: 'inline' },
  { kind: 'nie', type: 'NATIONAL_ID', generate: g.generateValidNie, languages: ['es'], placement: 'inline' },
  { kind: 'codice-fiscale', type: 'NATIONAL_ID', generate: g.generateValidCodiceFiscale, languages: ['it'], placement: 'inline' },
  { kind: 'bsn', type: 'NATIONAL_ID', generate: g.generateValidBsn, languages: ['nl'], placement: 'inline' },
  { kind: 'rrn-be', type: 'NATIONAL_ID', generate: g.generateValidBeRrn, languages: ['nl', 'fr'], placement: 'inline' },
  { kind: 'pesel', type: 'NATIONAL_ID', generate: g.generateValidPesel, languages: ['pl'], placement: 'inline' },
  { kind: 'nip', type: 'TAX_ID', generate: g.generateValidNip, languages: ['pl'], placement: 'inline' },
  { kind: 'regon', type: 'TAX_ID', generate: g.generateValidRegon, languages: ['pl'], placement: 'inline' },
  { kind: 'personnummer', type: 'NATIONAL_ID', generate: g.generateValidPersonnummer, languages: ['sv'], placement: 'inline' },
  { kind: 'fodselsnummer', type: 'NATIONAL_ID', generate: g.generateValidFodselsnummer, languages: ['da', 'sv'], placement: 'inline' },
  { kind: 'cpr', type: 'NATIONAL_ID', generate: g.generateValidCpr, languages: ['da'], placement: 'inline' },
  { kind: 'hetu', type: 'NATIONAL_ID', generate: g.generateValidHetu, languages: ['fi'], placement: 'inline' },
  { kind: 'kennitala', type: 'NATIONAL_ID', generate: g.generateValidKennitala, languages: ['da', 'en'], placement: 'inline' },
  { kind: 'pt-nif', type: 'TAX_ID', generate: g.generateValidPtNif, languages: ['pt'], placement: 'inline' },
  { kind: 'afm', type: 'TAX_ID', generate: g.generateValidAfm, languages: ['el'], placement: 'inline' },
  { kind: 'rodne-cislo', type: 'NATIONAL_ID', generate: g.generateValidRodneCislo, languages: ['cs'], placement: 'inline' },
  { kind: 'szemelyi', type: 'NATIONAL_ID', generate: g.generateValidSzemelyi, languages: ['en'], placement: 'inline' },
  { kind: 'cnp', type: 'NATIONAL_ID', generate: g.generateValidCnp, languages: ['ro'], placement: 'inline' },
  { kind: 'egn', type: 'NATIONAL_ID', generate: g.generateValidEgn, languages: ['ru', 'en'], placement: 'inline' },
  { kind: 'oib', type: 'NATIONAL_ID', generate: g.generateValidOib, languages: ['en'], placement: 'inline' },
  { kind: 'emso', type: 'NATIONAL_ID', generate: g.generateValidEmso, languages: ['en'], placement: 'inline' },
  { kind: 'tckn', type: 'NATIONAL_ID', generate: g.generateValidTckn, languages: ['tr'], placement: 'inline', weight: 2 },
  { kind: 'vkn', type: 'TAX_ID', generate: g.generateValidVkn, languages: ['tr'], placement: 'inline' },
  { kind: 'inn', type: 'TAX_ID', generate: g.generateValidInn12, languages: ['ru'], placement: 'inline' },
  { kind: 'snils', type: 'NATIONAL_ID', generate: g.generateValidSnils, languages: ['ru'], placement: 'inline' },
  { kind: 'rnokpp', type: 'TAX_ID', generate: g.generateValidRnokpp, languages: ['uk'], placement: 'inline' },
  { kind: 'iin', type: 'NATIONAL_ID', generate: g.generateValidIin, languages: ['ru'], placement: 'inline' },
  { kind: 'teudat-zehut', type: 'NATIONAL_ID', generate: g.generateValidTeudatZehut, languages: ['he'], placement: 'inline' },
  { kind: 'saudi-id', type: 'NATIONAL_ID', generate: g.generateValidSaudiId, languages: ['ar'], placement: 'inline' },
  { kind: 'emirates-id', type: 'NATIONAL_ID', generate: g.generateValidEmiratesId, languages: ['ar'], placement: 'inline' },
  { kind: 'qid', type: 'NATIONAL_ID', generate: g.generateValidQid, languages: ['ar'], placement: 'inline' },
  { kind: 'kw-civil-id', type: 'NATIONAL_ID', generate: g.generateValidKwCivilId, languages: ['ar'], placement: 'inline' },
  { kind: 'aadhaar', type: 'NATIONAL_ID', generate: g.generateValidAadhaar, languages: ['hi'], placement: 'inline', weight: 2 },
  { kind: 'pan', type: 'TAX_ID', generate: g.generateValidPan, languages: ['hi'], placement: 'inline' },
  { kind: 'ric', type: 'NATIONAL_ID', generate: g.generateValidRic, languages: ['zh'], placement: 'inline', weight: 2 },
  { kind: 'tw-id', type: 'NATIONAL_ID', generate: g.generateValidTwId, languages: ['zh'], placement: 'inline' },
  { kind: 'my-number', type: 'NATIONAL_ID', generate: g.generateValidMyNumber, languages: ['ja'], placement: 'inline' },
  { kind: 'rrn-kr', type: 'NATIONAL_ID', generate: g.generateValidKrRrn, languages: ['ko'], placement: 'inline' },
  { kind: 'nric', type: 'NATIONAL_ID', generate: g.generateValidNric, languages: ['en', 'zh'], placement: 'inline' },
  { kind: 'hkid', type: 'NATIONAL_ID', generate: g.generateValidHkid, languages: ['zh', 'en'], placement: 'inline' },
  { kind: 'cnic', type: 'NATIONAL_ID', generate: g.generateValidCnic, languages: ['en', 'hi'], placement: 'inline' },
  { kind: 'bd-nid', type: 'NATIONAL_ID', generate: g.generateValidBdNid, languages: ['hi', 'en'], placement: 'inline' },
  { kind: 'mykad', type: 'NATIONAL_ID', generate: g.generateValidMykad, languages: ['en'], placement: 'inline' },
  { kind: 'nik', type: 'NATIONAL_ID', generate: g.generateValidNik, languages: ['en'], placement: 'inline' },
  { kind: 'thai-id', type: 'NATIONAL_ID', generate: g.generateValidThaiId, languages: ['th'], placement: 'inline' },
  { kind: 'cccd', type: 'NATIONAL_ID', generate: g.generateValidCccd, languages: ['en'], placement: 'inline' },
  { kind: 'psn', type: 'NATIONAL_ID', generate: g.generateValidPsn, languages: ['en'], placement: 'inline' },
  { kind: 'tfn', type: 'TAX_ID', generate: g.generateValidTfn, languages: ['en'], placement: 'inline' },
  { kind: 'medicare', type: 'NATIONAL_ID', generate: g.generateValidMedicare, languages: ['en'], placement: 'inline' },
  { kind: 'abn', type: 'TAX_ID', generate: g.generateValidAbn, languages: ['en'], placement: 'inline' },
  { kind: 'ird', type: 'TAX_ID', generate: g.generateValidIrd, languages: ['en'], placement: 'inline' },
  { kind: 'cpf', type: 'NATIONAL_ID', generate: g.generateValidCpf, languages: ['pt'], placement: 'inline', weight: 2 },
  { kind: 'cnpj', type: 'TAX_ID', generate: g.generateValidCnpj, languages: ['pt'], placement: 'inline' },
  { kind: 'curp', type: 'NATIONAL_ID', generate: g.generateValidCurp, languages: ['es'], placement: 'inline' },
  { kind: 'rfc', type: 'TAX_ID', generate: g.generateValidRfc, languages: ['es'], placement: 'inline' },
  { kind: 'cuit', type: 'TAX_ID', generate: g.generateValidCuit, languages: ['es'], placement: 'inline' },
  { kind: 'ar-dni', type: 'NATIONAL_ID', generate: (s) => `DNI ${g.mulberry32(s)() < 0.5 ? '12.345.678' : '23.456.789'}`, languages: ['es'], placement: 'inline', valuePattern: /\d{1,2}\.\d{3}\.\d{3}$/ },
  { kind: 'rut', type: 'NATIONAL_ID', generate: g.generateValidRut, languages: ['es'], placement: 'inline' },
  { kind: 'nit', type: 'TAX_ID', generate: g.generateValidNit, languages: ['es'], placement: 'inline' },
  { kind: 'pe-dni', type: 'NATIONAL_ID', generate: g.generateValidPeDni, languages: ['es'], placement: 'inline', valuePattern: /\d{8}$/ },
  { kind: 'za-id', type: 'NATIONAL_ID', generate: g.generateValidZaId, languages: ['en'], placement: 'inline' },
  { kind: 'nin-ng', type: 'NATIONAL_ID', generate: g.generateValidNin, languages: ['en'], placement: 'inline', valuePattern: /\d{11}$/ },
  { kind: 'ke-id', type: 'NATIONAL_ID', generate: g.generateValidKeId, languages: ['en'], placement: 'inline', valuePattern: /\d{8}$/ },
  { kind: 'eg-id', type: 'NATIONAL_ID', generate: g.generateValidEgId, languages: ['ar'], placement: 'inline' },
  { kind: 'cnie', type: 'NATIONAL_ID', generate: g.generateValidCnie, languages: ['ar', 'fr'], placement: 'inline', valuePattern: /[A-Z]{1,2}\d{6}$/ },
  // ── EU VAT ──
  { kind: 'eu-vat', type: 'VAT_NUMBER', generate: g.generateValidEuVat, placement: 'inline', weight: 2 },
];

/** Kinds usable in a given language: affine kinds plus all global kinds. */
export function kindsForLanguage(language: string): readonly EntityKind[] {
  return ENTITY_BANK.filter((k) => k.languages === undefined || k.languages.includes(language));
}
