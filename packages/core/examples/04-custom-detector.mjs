/**
 * Adding a detector for an identifier the package does not know.
 *
 * A registered detector is not a second-class citizen: it goes through the
 * same validation, context scoring, overlap resolution and masking as the
 * built-ins, and `detectableEntityTypes()` picks it up because that list is
 * derived from the registry rather than declared.
 */

import assert from 'node:assert/strict';
import {
  CONFIDENCE,
  GLOBAL_REGION,
  detectorsForEntityType,
  invalid,
  protect,
  registerDetector,
  valid,
} from '@discretion/core';

registerDetector({
  id: 'acme-employee-id',
  entityType: 'NATIONAL_ID',
  regions: [GLOBAL_REGION],
  pattern: /\bACME-\d{7}\b/gu,
  baseConfidence: CONFIDENCE.HIGH,
  description: 'Acme internal employee number: seven digits summing to a multiple of seven.',
  // NOTE THE ARGUMENT. `ctx.text` is the WHOLE normalized document, not the
  // matched substring - the match is `ctx.match[0]`, or `text.slice(start,
  // end)`. The first draft of this example destructured `text` and sliced it,
  // which silently validated a slice of the surrounding sentence, failed the
  // checksum, and reported nothing at all.
  validate: ({ match }) => {
    const digits = match[0].slice('ACME-'.length);
    const sum = [...digits].reduce((total, digit) => total + Number(digit), 0);
    // A real check digit, so the detector rejects a lookalike rather than
    // reporting anything of the right shape.
    return sum % 7 === 0 ? valid({ confidence: CONFIDENCE.MAXIMUM }) : invalid('checksum');
  },
});

assert.ok(
  detectorsForEntityType('NATIONAL_ID').some((d) => d.id === 'acme-employee-id'),
  'the detector did not register',
);

// 1+2+3+4+5+6+0 = 21, a multiple of seven.
const good = await protect('Employee ACME-1234560 signed off.', { seed: 2 });
console.log('valid id  :', good.maskedText);
assert.equal(good.maskedText.includes('ACME-1234560'), false, 'the custom id was not masked');

// 1+1+1+1+1+1+1 = 7 is fine; 1111112 sums to 8 and must be rejected.
const bad = await protect('Employee ACME-1111112 signed off.', { seed: 2 });
console.log('bad check :', bad.maskedText);
assert.ok(bad.maskedText.includes('ACME-1111112'), 'a failing checksum was masked anyway');

console.log('ok        : custom detector validated, masked, and rejected a lookalike');
