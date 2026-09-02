[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / GazetteerHit

# Interface: GazetteerHit

Defined in: [packages/core/src/gazetteer/index.ts:95](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/gazetteer/index.ts#L95)

How a value matched the gazetteer.

## Properties

### matchedWords

> `readonly` **matchedWords**: `number`

Defined in: [packages/core/src/gazetteer/index.ts:100](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/gazetteer/index.ts#L100)

Number of the value's words that matched, for multi-word names.

***

### totalWords

> `readonly` **totalWords**: `number`

Defined in: [packages/core/src/gazetteer/index.ts:101](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/gazetteer/index.ts#L101)

***

### type

> `readonly` **type**: [`GazetteerType`](../type-aliases/GazetteerType.md)

Defined in: [packages/core/src/gazetteer/index.ts:96](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/gazetteer/index.ts#L96)

***

### whole

> `readonly` **whole**: `boolean`

Defined in: [packages/core/src/gazetteer/index.ts:98](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/gazetteer/index.ts#L98)

True when the whole value matched, rather than one of its words.
