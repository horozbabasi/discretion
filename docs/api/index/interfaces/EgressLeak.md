[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / EgressLeak

# Interface: EgressLeak

Defined in: [packages/core/src/mask/egressGuard.ts:33](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/egressGuard.ts#L33)

## Properties

### entryId

> `readonly` **entryId**: `string`

Defined in: [packages/core/src/mask/egressGuard.ts:35](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/egressGuard.ts#L35)

Vault entry id — never the value.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/mask/egressGuard.ts:36](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/egressGuard.ts#L36)

***

### via

> `readonly` **via**: `"normalized"` \| `"separator-insensitive"`

Defined in: [packages/core/src/mask/egressGuard.ts:38](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/egressGuard.ts#L38)

Which comparison caught it (for diagnostics/UI copy).
