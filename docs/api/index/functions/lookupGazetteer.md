[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / lookupGazetteer

# Function: lookupGazetteer()

> **lookupGazetteer**(`value`, `type`): [`GazetteerHit`](../interfaces/GazetteerHit.md) \| `undefined`

Defined in: [packages/core/src/gazetteer/index.ts:115](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/gazetteer/index.ts#L115)

Look a value up as `type`.

A person's full name is rarely a single gazetteer entry — the sets hold
given names and family names separately — so a multi-word value is checked
whole first, then word by word. `matchedWords` lets the caller weigh
"every word is a known name" differently from "one word out of four is".

## Parameters

### value

`string`

### type

[`GazetteerType`](../type-aliases/GazetteerType.md)

## Returns

[`GazetteerHit`](../interfaces/GazetteerHit.md) \| `undefined`
