/**
 * Choosing what gets reported: profiles, per-type toggles, and lists.
 *
 * The point worth taking from this file is the last assertion: a type you
 * switch off is NOT MASKED. Excluding it removes it from the report and from
 * the substitution, which is the honest consequence and not always the one
 * people expect.
 */

import assert from 'node:assert/strict';
import { protect, detectableEntityTypes, exposureBand } from '@discretion/core';

const message = 'Card 5555341244441115 for Acme Ltd, ref DE44500105175407324931.';

const balanced = await protect(message, { seed: 5 });
console.log('balanced :', balanced.entities.map((e) => e.type).join(', ') || '(none)');
assert.ok(balanced.entities.length > 0, 'balanced found nothing');

// `minimal` covers secrets and financial only.
const minimal = await protect(message, { profile: 'minimal', seed: 5 });
console.log('minimal  :', minimal.entities.map((e) => e.type).join(', ') || '(none)');
assert.ok(
  minimal.entities.length <= balanced.entities.length,
  'minimal reported more than balanced',
);

// Turning a type off means it is not replaced either.
const noCards = await protect(message, { seed: 5, typeAllowed: (t) => t !== 'CREDIT_CARD' });
assert.equal(noCards.entities.some((e) => e.type === 'CREDIT_CARD'), false);
assert.ok(noCards.maskedText.includes('5555341244441115'), 'an excluded type was masked anyway');
console.log('excluded : CREDIT_CARD stays in the text, as documented');

// Exposure is scored before masking, so it describes the risk of the input.
console.log('exposure :', balanced.exposure.score.toFixed(1), `(${exposureBand(balanced.exposure.score)})`);
assert.ok(balanced.exposure.score > 0);

// The engine can tell you what it is able to look for.
console.log('types    :', detectableEntityTypes().length, 'detectable entity types');
assert.equal(detectableEntityTypes().includes('DATE_OF_BIRTH'), false);

console.log('ok       : profiles, toggles and exposure behave as documented');
