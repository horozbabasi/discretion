[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / EgressVerdict

# Interface: EgressVerdict

Defined in: [packages/core/src/mask/egressGuard.ts:41](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/egressGuard.ts#L41)

## Properties

### leaks

> `readonly` **leaks**: readonly [`EgressLeak`](EgressLeak.md)[]

Defined in: [packages/core/src/mask/egressGuard.ts:44](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/egressGuard.ts#L44)

***

### ok

> `readonly` **ok**: `boolean`

Defined in: [packages/core/src/mask/egressGuard.ts:43](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/egressGuard.ts#L43)

True = safe to send. False = BLOCK; SPEC.md forbids fail-open.
