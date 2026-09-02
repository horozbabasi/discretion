[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / NerSpan

# Interface: NerSpan

Defined in: [packages/core/src/ner/types.ts:47](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L47)

A merged entity span in NORMALIZED-text coordinates.

## Properties

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/ner/types.ts:50](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L50)

***

### gazetteer?

> `readonly` `optional` **gazetteer?**: [`GazetteerHit`](GazetteerHit.md)

Defined in: [packages/core/src/ner/types.ts:64](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L64)

Stage 2b corroboration, when the gazetteer knows this name.

Attached HERE rather than looked up in Stage 3 because SPEC places the
gazetteers in Stage 2 — "checked in parallel with the model" — and
because the sets are only meaningful for the types the model produces.
See ner/stage2b.ts for what that placement was costing.

Absent on a miss. "Not in the gazetteer" is not evidence against a name.

***

### score

> `readonly` **score**: `number`

Defined in: [packages/core/src/ner/types.ts:53](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L53)

Minimum token score across the entity — the conservative aggregate.

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/ner/types.ts:49](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L49)

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/ner/types.ts:51](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L51)

***

### type

> `readonly` **type**: [`NerEntityType`](../type-aliases/NerEntityType.md)

Defined in: [packages/core/src/ner/types.ts:48](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/types.ts#L48)
