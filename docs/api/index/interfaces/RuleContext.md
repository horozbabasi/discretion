[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / RuleContext

# Interface: RuleContext

Defined in: [packages/core/src/context/types.ts:110](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L110)

The evidence a rule sees about one candidate.

Deliberately narrow: rules receive the document text and the candidate's
span, not the other candidates. Reasoning about OTHER candidates' spans is
overlap resolution, which SPEC.md assigns to Stage 4 — keeping it out of
this interface is what stops Stage 3 quietly absorbing M8's job.
Co-occurrence, the one signal that legitimately looks across candidates,
runs as a separate pass with its own input.

## Properties

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/context/types.ts:116](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L116)

Candidate end offset (exclusive).

***

### line

> `readonly` **line**: `object`

Defined in: [packages/core/src/context/types.ts:120](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L120)

The line containing the candidate, and the candidate's offsets within it.

#### end

> `readonly` **end**: `number`

#### start

> `readonly` **start**: `number`

#### text

> `readonly` **text**: `string`

***

### profile

> `readonly` **profile**: [`DocumentProfile`](DocumentProfile.md)

Defined in: [packages/core/src/context/types.ts:118](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L118)

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/context/types.ts:114](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L114)

Candidate start offset in the normalized text (inclusive).

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/context/types.ts:112](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L112)

The full normalized document text.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/context/types.ts:117](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L117)
