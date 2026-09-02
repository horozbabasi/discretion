[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ValidationSuccess

# Interface: ValidationSuccess

Defined in: [packages/core/src/detect/types.ts:141](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L141)

The match is an instance of this entity type.

## Properties

### canonical?

> `readonly` `optional` **canonical?**: `string`

Defined in: [packages/core/src/detect/types.ts:154](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L154)

Canonical form of the value: separators stripped, case normalized. Later
milestones key the vault on this so that `4111 1111 1111 1111` and
`4111-1111-1111-1111` resolve to one entry.

***

### confidence?

> `readonly` `optional` **confidence?**: `number`

Defined in: [packages/core/src/detect/types.ts:148](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L148)

Confidence for this specific match, overriding the detector's
`baseConfidence`. Use when one detector's certainty varies by case — a
public/reserved IP range is a weaker signal than a routable address.

***

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/detect/types.ts:170](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L170)

Scheme details for Stage 4 fusion and M4 substitution. For a national
identifier this carries the concrete scheme and country, which is how the
family design stays extensible: `{ scheme: 'tckn', country: 'TR' }`.

***

### sensitive?

> `readonly` `optional` **sensitive?**: `boolean`

Defined in: [packages/core/src/detect/types.ts:164](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L164)

Whether this value is actually sensitive.

SPEC.md requires known test values to be "matched but classified as
non-sensitive" — the documentation IBAN GB82WEST…, the Visa test card
4111…, reserved example domains. They are detected so the eval corpus can
assert they were seen, and marked non-sensitive so they are never masked.
Defaults to `true`.

***

### span?

> `readonly` `optional` **span?**: `object`

Defined in: [packages/core/src/detect/types.ts:182](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L182)

Narrow the span to a sub-range of the regex match, in offsets relative to
the full scanned text. Patterns often need leading context to anchor
(a label, a delimiter) that must not be masked along with the value.

#### end

> `readonly` **end**: `number`

#### start

> `readonly` **start**: `number`

***

### valid

> `readonly` **valid**: `true`

Defined in: [packages/core/src/detect/types.ts:142](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L142)

***

### validator?

> `readonly` `optional` **validator?**: `string`

Defined in: [packages/core/src/detect/types.ts:176](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L176)

Name of the validator that passed, surfaced in `EntityExplanation
.validatorPassed`. SPEC.md: every emitted entity carries an explanation
of "which validator passed".
