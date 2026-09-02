/**
 * The integration mistake that matters most.
 *
 * `protect()` rejects when a stage fails. It does not return an empty result,
 * because "I could not check" and "there was nothing to find" must not produce
 * the same value — a caller that cannot tell them apart will send the original
 * text on the day detection breaks.
 *
 * This file demonstrates the failure and the correct handling. There is no
 * option to make it fail open, deliberately.
 */

import assert from 'node:assert/strict';
import { protect } from '@privacyshield/core';

const message = 'Card 5555341244441115 and IBAN DE44500105175407324931.';

// A Stage 2 recogniser that is broken, standing in for any stage failure.
const broken = {
  id: 'demonstration-broken-recogniser',
  warmup: () => Promise.resolve(),
  recognize: () => Promise.reject(new Error('model unavailable')),
};

let rejected = false;
try {
  await protect(message, { ner: broken });
} catch (error) {
  rejected = true;
  console.log('rejected :', error.message);
}
assert.ok(rejected, 'protect() swallowed a stage failure - this would be a critical bug');

// The correct shape for a caller. Note what it does NOT do: fall back to the
// original text.
async function sendSafely(text) {
  let result;
  try {
    result = await protect(text, { ner: broken });
  } catch (error) {
    return { sent: false, reason: `detection failed: ${error.message}` };
  }
  return { sent: true, body: result.maskedText };
}

const outcome = await sendSafely(message);
console.log('outcome  :', JSON.stringify(outcome));

assert.equal(outcome.sent, false);
assert.equal('body' in outcome, false, 'the original text was carried through a failure');

console.log('ok       : a stage failure blocks the send instead of passing the original');
