[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / buildStructureIndex

# Function: buildStructureIndex()

> **buildStructureIndex**(`text`): [`StructureIndex`](../interfaces/StructureIndex.md)

Defined in: [packages/core/src/context/structure.ts:573](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L573)

Build the structural index for a document.

Slots may overlap — a CSV cell and a colon-form label can both cover a span.
`slotAt` resolves that by returning the SMALLEST containing slot, which is
the most specific label for the value.

## Parameters

### text

`string`

## Returns

[`StructureIndex`](../interfaces/StructureIndex.md)
