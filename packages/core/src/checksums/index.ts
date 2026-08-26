/**
 * Shared checksum library.
 *
 * SPEC.md, Stage 1: "implement with full checksum validation, not pattern
 * matching". These are the algorithms the identifier validators are built
 * from — each implemented once here, tested once in
 * `test/checksums.test.ts`, and reused by every detector that needs it.
 *
 * Nothing in this directory knows what a detector or an entity type is. These
 * are pure functions over strings and digit arrays, which is what makes them
 * cheap to property-test exhaustively.
 */

export { toDigits, stripSeparators, alphanumericValue, toNumericString, isAllDigits, isRepdigit } from './digits.js';

export { weightedSum, weightedMod, weightedModBy, cyclicWeightedMod, complement } from './weighted.js';

export { luhnValid, luhnCheckDigit } from './luhn.js';

export { verhoeffValid, verhoeffCheckDigit } from './verhoeff.js';

export { modString, ibanMod97Valid, ibanCheckDigits, mod97Key } from './mod97.js';

export {
  iso7064PureCheckValue,
  iso7064PureValid,
  mod11_2Valid,
  mod11_2CheckChar,
  mod37_36Valid,
  mod11_10CheckDigit,
  mod11_10Valid,
} from './iso7064.js';

export { abaValid, abaCheckDigit } from './aba.js';

export { mrzCharValue, mrzCheckDigit, mrzCheckValid } from './icao9303.js';
