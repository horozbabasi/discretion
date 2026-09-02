[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ScriptInfo

# Interface: ScriptInfo

Defined in: [packages/core/src/types.ts:244](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L244)

Per-script breakdown of a piece of text.

## Properties

### counts

> **counts**: `Readonly`\<`Record`\<[`ScriptName`](../type-aliases/ScriptName.md), `number`\>\>

Defined in: [packages/core/src/types.ts:250](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L250)

Letter counts per script. Script-neutral characters — whitespace, digits,
punctuation, symbols, combining marks — are not counted at all; letters of
scripts outside the supported list are counted under 'other'.

***

### dominant

> **dominant**: [`ScriptName`](../type-aliases/ScriptName.md) \| `null`

Defined in: [packages/core/src/types.ts:256](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L256)

The script with the strictly highest letter count among the supported
(non-'other') scripts, or null when the text has no such letters or the
top count is tied.

***

### mixed

> **mixed**: `boolean`

Defined in: [packages/core/src/types.ts:258](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L258)

True when letters of two or more supported scripts are present.
