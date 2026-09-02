[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / EgressAuditor

# Interface: EgressAuditor

Defined in: [packages/core/src/mask/vault.ts:37](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/vault.ts#L37)

What the egress guard receives: the one deliberate door to plaintext.

## Methods

### auditEntries()

> **auditEntries**(): readonly `object`[]

Defined in: [packages/core/src/mask/vault.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/vault.ts#L39)

Every entry: (exact original, canonical, id, type). Guard-only.

#### Returns

readonly `object`[]
