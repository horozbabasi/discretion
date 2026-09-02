[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / profileDocument

# Function: profileDocument()

> **profileDocument**(`text`, `options?`): [`DocumentProfile`](../interfaces/DocumentProfile.md)

Defined in: [packages/core/src/context/documentProfile.ts:259](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/documentProfile.ts#L259)

Classify a document's format and subject domain.

`structureIndex` is accepted rather than rebuilt so callers that already
have one (the analyzer does) pay for it once.

## Parameters

### text

`string`

### options?

#### domainLexicon?

`Readonly`\<`Partial`\<`Record`\<`"financial"` \| `"medical"` \| `"legal"`, readonly `string`[]\>\>\>

#### structureIndex?

[`StructureIndex`](../interfaces/StructureIndex.md)

## Returns

[`DocumentProfile`](../interfaces/DocumentProfile.md)
