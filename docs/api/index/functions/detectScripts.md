[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / detectScripts

# Function: detectScripts()

> **detectScripts**(`text`): [`ScriptInfo`](../interfaces/ScriptInfo.md)

Defined in: [packages/core/src/scripts.ts:134](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/scripts.ts#L134)

Per-script letter counts, the dominant script, and whether the text mixes
scripts. Whitespace, digits, and punctuation are ignored — they are
script-neutral and would skew dominance.

## Parameters

### text

`string`

## Returns

[`ScriptInfo`](../interfaces/ScriptInfo.md)
