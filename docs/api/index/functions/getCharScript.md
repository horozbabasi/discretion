[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / getCharScript

# Function: getCharScript()

> **getCharScript**(`char`): [`ScriptName`](../type-aliases/ScriptName.md)

Defined in: [packages/core/src/scripts.ts:92](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/scripts.ts#L92)

The ScriptName for a single character (the first code point of `char`).
Script-neutral characters and letters of unsupported scripts both report
'other'.

## Parameters

### char

`string`

## Returns

[`ScriptName`](../type-aliases/ScriptName.md)
