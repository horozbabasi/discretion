[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / Stage2Candidate

# Interface: Stage2Candidate

Defined in: [packages/core/src/ner/types.ts:95](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L95)

Stage 2 candidates share Stage 1's shape (SPEC: one candidate contract
for the whole pipeline), differing only in the stage tag.

## Extends

- `Omit`\<[`Stage1Candidate`](Stage1Candidate.md), `"stage"`\>

## Properties

### canonical

> `readonly` **canonical**: `string`

Defined in: [packages/core/src/detect/types.ts:292](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L292)

Canonical form, separators stripped and case normalized.

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`canonical`](Stage1Candidate.md#canonical)

***

### detectorId

> `readonly` **detectorId**: `string`

Defined in: [packages/core/src/detect/types.ts:287](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L287)

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`detectorId`](Stage1Candidate.md#detectorid)

***

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/detect/types.ts:280](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L280)

End offset in the NORMALIZED text (exclusive).

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`end`](Stage1Candidate.md#end)

***

### gazetteer?

> `readonly` `optional` **gazetteer?**: [`GazetteerHit`](GazetteerHit.md)

Defined in: [packages/core/src/ner/types.ts:98](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L98)

Stage 2b corroboration, carried through to Stage 3's scorer.

***

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/detect/types.ts:293](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L293)

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`metadata`](Stage1Candidate.md#metadata)

***

### originalEnd

> `readonly` **originalEnd**: `number`

Defined in: [packages/core/src/detect/types.ts:284](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L284)

End offset in the ORIGINAL text (exclusive), via the Stage 0 map.

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`originalEnd`](Stage1Candidate.md#originalend)

***

### originalStart

> `readonly` **originalStart**: `number`

Defined in: [packages/core/src/detect/types.ts:282](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L282)

Start offset in the ORIGINAL text (inclusive), via the Stage 0 map.

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`originalStart`](Stage1Candidate.md#originalstart)

***

### rawConfidence

> `readonly` **rawConfidence**: `number`

Defined in: [packages/core/src/detect/types.ts:285](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L285)

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`rawConfidence`](Stage1Candidate.md#rawconfidence)

***

### sensitive

> `readonly` **sensitive**: `boolean`

Defined in: [packages/core/src/detect/types.ts:290](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L290)

False for known test/documentation values, which are detected but must
 never be masked.

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`sensitive`](Stage1Candidate.md#sensitive)

***

### stage

> `readonly` **stage**: `"stage2-ner"`

Defined in: [packages/core/src/ner/types.ts:96](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/types.ts#L96)

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/detect/types.ts:278](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L278)

Start offset in the NORMALIZED text (inclusive).

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`start`](Stage1Candidate.md#start)

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/detect/types.ts:275](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L275)

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`text`](Stage1Candidate.md#text)

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/detect/types.ts:276](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L276)

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`type`](Stage1Candidate.md#type)

***

### validatorPassed?

> `readonly` `optional` **validatorPassed?**: `string`

Defined in: [packages/core/src/detect/types.ts:295](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L295)

Which validator passed, for the entity explanation.

#### Inherited from

[`Stage1Candidate`](Stage1Candidate.md).[`validatorPassed`](Stage1Candidate.md#validatorpassed)
