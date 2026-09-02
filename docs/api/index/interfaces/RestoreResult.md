[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / RestoreResult

# Interface: RestoreResult

Defined in: [packages/core/src/types.ts:214](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L214)

Result of restoring masked values in a piece of text.

## Properties

### restoredCount

> **restoredCount**: `number`

Defined in: [packages/core/src/types.ts:217](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L217)

How many replacements were restored to their originals.

***

### restoredText

> **restoredText**: `string`

Defined in: [packages/core/src/types.ts:215](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L215)

***

### unmatchedReplacements

> **unmatchedReplacements**: readonly `string`[]

Defined in: [packages/core/src/types.ts:219](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L219)

Replacements found in the text with no matching vault entry.
