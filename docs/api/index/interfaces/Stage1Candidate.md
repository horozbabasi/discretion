[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / Stage1Candidate

# Interface: Stage1Candidate

Defined in: [packages/core/src/detect/types.ts:274](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L274)

A Stage 1 candidate, extending the shared `Candidate` with the original-text
span.

`Candidate.start`/`end` are offsets into the NORMALIZED text, which is the
M1 contract every offset-map invariant is written against. Substitution
however edits the ORIGINAL text, so the runner resolves both up front via
`mapNormalizedSpan` and carries them together. Recorded as ARCHITECTURE.md
D7: the alternative — redefining `Candidate.start` to mean original offsets
— would silently invalidate the M1 offset-map tests.

## Properties

### canonical

> `readonly` **canonical**: `string`

Defined in: [packages/core/src/detect/types.ts:292](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L292)

Canonical form, separators stripped and case normalized.

***

### detectorId

> `readonly` **detectorId**: `string`

Defined in: [packages/core/src/detect/types.ts:287](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L287)

***

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/detect/types.ts:280](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L280)

End offset in the NORMALIZED text (exclusive).

***

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/detect/types.ts:293](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L293)

***

### originalEnd

> `readonly` **originalEnd**: `number`

Defined in: [packages/core/src/detect/types.ts:284](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L284)

End offset in the ORIGINAL text (exclusive), via the Stage 0 map.

***

### originalStart

> `readonly` **originalStart**: `number`

Defined in: [packages/core/src/detect/types.ts:282](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L282)

Start offset in the ORIGINAL text (inclusive), via the Stage 0 map.

***

### rawConfidence

> `readonly` **rawConfidence**: `number`

Defined in: [packages/core/src/detect/types.ts:285](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L285)

***

### sensitive

> `readonly` **sensitive**: `boolean`

Defined in: [packages/core/src/detect/types.ts:290](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L290)

False for known test/documentation values, which are detected but must
 never be masked.

***

### stage

> `readonly` **stage**: `"stage1-validated-identifier"`

Defined in: [packages/core/src/detect/types.ts:286](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L286)

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/detect/types.ts:278](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L278)

Start offset in the NORMALIZED text (inclusive).

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/detect/types.ts:275](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L275)

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/detect/types.ts:276](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L276)

***

### validatorPassed?

> `readonly` `optional` **validatorPassed?**: `string`

Defined in: [packages/core/src/detect/types.ts:295](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L295)

Which validator passed, for the entity explanation.
