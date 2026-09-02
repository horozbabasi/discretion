[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / EgressAuditor

# Interface: EgressAuditor

Defined in: [packages/core/src/mask/vault.ts:37](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L37)

What the egress guard receives: the one deliberate door to plaintext.

## Methods

### auditEntries()

> **auditEntries**(): readonly `object`[]

Defined in: [packages/core/src/mask/vault.ts:39](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L39)

Every entry: (exact original, canonical, id, type). Guard-only.

#### Returns

readonly `object`[]
