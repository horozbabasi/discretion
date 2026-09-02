[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ChunkCache

# Class: ChunkCache

Defined in: [packages/core/src/ner/chunkCache.ts:63](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunkCache.ts#L63)

## Constructors

### Constructor

> **new ChunkCache**(): `ChunkCache`

#### Returns

`ChunkCache`

## Accessors

### stats

#### Get Signature

> **get** **stats**(): `object`

Defined in: [packages/core/src/ner/chunkCache.ts:107](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunkCache.ts#L107)

Counts only — never keys, never values. For the diagnostic.

##### Returns

`object`

###### hits

> `readonly` **hits**: `number`

###### misses

> `readonly` **misses**: `number`

###### size

> `readonly` **size**: `number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/ner/chunkCache.ts:102](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunkCache.ts#L102)

Drops every original. Called when the session it belongs to ends.

#### Returns

`void`

***

### get()

> **get**(`chunkText`): [`NerSpan`](../interfaces/NerSpan.md)[] \| `undefined`

Defined in: [packages/core/src/ner/chunkCache.ts:69](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunkCache.ts#L69)

#### Parameters

##### chunkText

`string`

#### Returns

[`NerSpan`](../interfaces/NerSpan.md)[] \| `undefined`

***

### set()

> **set**(`chunkText`, `spans`): `void`

Defined in: [packages/core/src/ner/chunkCache.ts:82](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunkCache.ts#L82)

#### Parameters

##### chunkText

`string`

##### spans

readonly [`NerSpan`](../interfaces/NerSpan.md)[]

#### Returns

`void`
