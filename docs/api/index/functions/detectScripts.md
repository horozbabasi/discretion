[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / detectScripts

# Function: detectScripts()

> **detectScripts**(`text`): [`ScriptInfo`](../interfaces/ScriptInfo.md)

Defined in: [packages/core/src/scripts.ts:134](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/scripts.ts#L134)

Per-script letter counts, the dominant script, and whether the text mixes
scripts. Whitespace, digits, and punctuation are ignored — they are
script-neutral and would skew dominance.

## Parameters

### text

`string`

## Returns

[`ScriptInfo`](../interfaces/ScriptInfo.md)
