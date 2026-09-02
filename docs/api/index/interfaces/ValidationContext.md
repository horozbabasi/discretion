[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ValidationContext

# Interface: ValidationContext

Defined in: [packages/core/src/detect/types.ts:113](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L113)

What a validator is given alongside the matched text.

Carries the surrounding text because several validators genuinely need it:
a passport MRZ spans multiple lines and must look at its siblings, and an
IP address must know whether it is inside a URL.

## Properties

### context?

> `readonly` `optional` **context?**: [`ContextSignal`](ContextSignal.md)

Defined in: [packages/core/src/detect/types.ts:126](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L126)

Stage 3 evidence. Always `undefined` in M2.

***

### defaultRegion?

> `readonly` `optional` **defaultRegion?**: `string`

Defined in: [packages/core/src/detect/types.ts:124](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L124)

The user's configured default region, used for ambiguous formats such as
 phone numbers. `undefined` when unset.

***

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/detect/types.ts:119](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L119)

End offset of the match within `text` (exclusive).

***

### match

> `readonly` **match**: `RegExpExecArray`

Defined in: [packages/core/src/detect/types.ts:121](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L121)

The regex match that produced this candidate, including capture groups.

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/detect/types.ts:117](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L117)

Start offset of the match within `text` (inclusive).

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/detect/types.ts:115](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L115)

The full normalized text the runner is scanning.
