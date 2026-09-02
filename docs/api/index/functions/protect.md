[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / protect

# Function: protect()

> **protect**(`text`, `options?`): `Promise`\<[`ProtectResult`](../interfaces/ProtectResult.md)\>

Defined in: [packages/core/src/protect.ts:179](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L179)

Detect sensitive values in `text` and replace them with stand-ins.

Throws on any stage failure rather than returning an empty result. See the
fail-closed note in this file's header.

## Parameters

### text

`string`

### options?

[`ProtectOptions`](../interfaces/ProtectOptions.md) = `{}`

## Returns

`Promise`\<[`ProtectResult`](../interfaces/ProtectResult.md)\>
