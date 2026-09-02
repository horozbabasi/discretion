[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / getCharScript

# Function: getCharScript()

> **getCharScript**(`char`): [`ScriptName`](../type-aliases/ScriptName.md)

Defined in: [packages/core/src/scripts.ts:92](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/scripts.ts#L92)

The ScriptName for a single character (the first code point of `char`).
Script-neutral characters and letters of unsupported scripts both report
'other'.

## Parameters

### char

`string`

## Returns

[`ScriptName`](../type-aliases/ScriptName.md)
