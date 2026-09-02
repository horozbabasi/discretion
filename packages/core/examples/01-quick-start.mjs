/**
 * The README's quick start, as a runnable file.
 *
 * These examples exist so the documentation cannot drift from the package:
 * `scripts/verify-standalone-consumer.sh` installs the built tarball into an
 * empty project outside this repository and runs every file in this directory.
 * If an example stops working, that check fails.
 *
 * Each one asserts rather than only printing, because a script that prints
 * something wrong still exits 0.
 */

import assert from 'node:assert/strict';
import { protect, restore } from '@privacyshield/core';

const message = 'Wire it to DE44500105175407324931 and use key sk_live_7f3Kq2mNpX8vC1bWzR4tY6.';

const result = await protect(message, { seed: 42 });

console.log('masked  :', result.maskedText);
console.log('found   :', result.entities.map((e) => `${e.type} -> ${e.surrogate}`).join(', '));

// The two values must be gone.
assert.equal(result.maskedText.includes('DE44500105175407324931'), false, 'IBAN survived');
assert.equal(result.maskedText.includes('sk_live_7f3Kq2mNpX8vC1bWzR4tY6'), false, 'key survived');

assert.deepEqual(result.entities.map((e) => e.type).sort(), ['API_KEY', 'IBAN']);

// The full stop after the key must survive. It did not until M12: the API_KEY
// pattern consumed it, so the same key mid-sentence and end-of-sentence were
// two different values and got two different stand-ins.
assert.ok(result.maskedText.endsWith('.'), 'the sentence lost its full stop');

// And the whole thing must come back.
assert.equal(restore(result.maskedText, result.vault).restoredText, message);

console.log('ok      : masked, and restored exactly');
