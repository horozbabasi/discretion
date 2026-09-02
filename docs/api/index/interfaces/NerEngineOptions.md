[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / NerEngineOptions

# Interface: NerEngineOptions

Defined in: [packages/core/src/ner/engine.ts:24](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/engine.ts#L24)

## Properties

### overlapChars?

> `readonly` `optional` **overlapChars?**: `number`

Defined in: [packages/core/src/ner/engine.ts:28](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/engine.ts#L28)

Window overlap in characters. Default 96.

***

### timeBudgetMs?

> `readonly` `optional` **timeBudgetMs?**: `number`

Defined in: [packages/core/src/ner/engine.ts:26](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/engine.ts#L26)

Hard deadline for one recognize() call. Default 2000 ms.

***

### useGazetteers?

> `readonly` `optional` **useGazetteers?**: `boolean`

Defined in: [packages/core/src/ner/engine.ts:35](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/engine.ts#L35)

Stage 2b gazetteer corroboration. Default true.

Lives here rather than in Stage 3's options because the lookup lives here:
SPEC places the gazetteers in Stage 2, checked in parallel with the model.
