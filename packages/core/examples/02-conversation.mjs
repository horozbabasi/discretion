/**
 * One vault across a conversation: consistent stand-ins, and a reply restored.
 *
 * The property this demonstrates is the reason the vault is a parameter rather
 * than something `protect()` hides: consistency is a property of the SESSION.
 * A vault created per call would hand the same value a new surrogate every
 * time, and a reply quoting the earlier stand-in could not be restored.
 */

import assert from 'node:assert/strict';
import { protect, restore, Restorer, Vault } from '@privacyshield/core';

const IBAN = 'DE44500105175407324931';
const vault = new Vault();

const first = await protect(`My IBAN is ${IBAN}.`, { vault, seed: 1 });
const second = await protect(`Again: ${IBAN}`, { vault, seed: 1 });

const surrogate = first.entities[0].surrogate;
console.log('surrogate :', surrogate);

// Same value, same stand-in, across separate calls.
assert.equal(second.entities[0].surrogate, surrogate, 'surrogate was not consistent');

// A reply that quotes the stand-in restores to the real value.
const reply = `Received ${surrogate}, thanks.`;
assert.equal(restore(reply, vault).restoredText, `Received ${IBAN}, thanks.`);
console.log('restored  :', restore(reply, vault).restoredText);

// The streaming form, which is what a chat UI needs: a surrogate split across
// two chunks must still be restored, so the restorer buffers.
const cut = Math.floor(surrogate.length / 2);
const chunks = ['Received ', surrogate.slice(0, cut), surrogate.slice(cut), ', thanks.'];

const restorer = new Restorer(vault);
let streamed = '';
for (const chunk of chunks) streamed += restorer.push(chunk);
streamed += restorer.finish();

assert.equal(streamed, `Received ${IBAN}, thanks.`, 'streaming restore lost the split surrogate');
console.log('streamed  :', streamed);
console.log('ok        : consistent across calls, and restored across a chunk boundary');
