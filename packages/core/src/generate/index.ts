/**
 * Deterministic valid-value generators — one per Stage 1 detector scheme.
 *
 * Public API: the eval package builds its labeled corpus from these, and
 * M4's format-preserving substitution synthesizes checksum-valid surrogates
 * with them. Each generator is seeded (mulberry32) and never calls the
 * validator it feeds.
 */
export { mulberry32 } from './prng.js';
export * from './bankcodes.js';
export * from './contact.js';
export * from './crypto.js';
export * from './documents.js';
export * from './financial.js';
export * from './location.js';
export * from './natidAmOc.js';
export * from './natidAsia.js';
export * from './natidCee.js';
export * from './natidMeCis.js';
export * from './natidWest.js';
export * from './secrets.js';
export * from './vat.js';
