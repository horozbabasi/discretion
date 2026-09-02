[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / EntityExplanation

# Interface: EntityExplanation

Defined in: [packages/core/src/types.ts:125](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L125)

Why an entity was reported — surfaced in the review UI and in eval output.

## Properties

### stages

> **stages**: readonly [`DetectionStage`](../type-aliases/DetectionStage.md)[]

Defined in: [packages/core/src/types.ts:127](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L127)

Which stages fired for this entity.

***

### triggers

> **triggers**: readonly `string`[]

Defined in: [packages/core/src/types.ts:129](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L129)

Which triggers matched (detector ids, trigger names, context words).

***

### validatorPassed?

> `optional` **validatorPassed?**: `string`

Defined in: [packages/core/src/types.ts:131](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L131)

Name of the validator that passed (checksum, format check), if any.
