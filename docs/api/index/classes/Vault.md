[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / Vault

# Class: Vault

Defined in: [packages/core/src/mask/vault.ts:42](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L42)

## Constructors

### Constructor

> **new Vault**(): `Vault`

#### Returns

`Vault`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [packages/core/src/mask/vault.ts:129](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L129)

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages/core/src/mask/vault.ts:134](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L134)

Wipe everything. Called on navigation away and conversation switch.

#### Returns

`void`

***

### createEgressAuditor()

> **createEgressAuditor**(): [`EgressAuditor`](../interfaces/EgressAuditor.md)

Defined in: [packages/core/src/mask/vault.ts:142](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L142)

THE one deliberate door to the plaintext set. Egress guard only.

#### Returns

[`EgressAuditor`](../interfaces/EgressAuditor.md)

***

### getByOriginal()

> **getByOriginal**(`original`, `canonical?`): [`VaultEntry`](../interfaces/VaultEntry.md) \| `undefined`

Defined in: [packages/core/src/mask/vault.ts:89](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L89)

Find the entry for an original: exact writing first, then the
detector's canonical form (separator variants of one identifier), then
the case/whitespace-normalized index — which only resolves when
unambiguous.

#### Parameters

##### original

`string`

##### canonical?

`string`

#### Returns

[`VaultEntry`](../interfaces/VaultEntry.md) \| `undefined`

***

### getBySurrogate()

> **getBySurrogate**(`replacement`): [`VaultEntry`](../interfaces/VaultEntry.md) \| `undefined`

Defined in: [packages/core/src/mask/vault.ts:104](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L104)

Find the entry whose replacement is exactly `replacement`.

#### Parameters

##### replacement

`string`

#### Returns

[`VaultEntry`](../interfaces/VaultEntry.md) \| `undefined`

***

### register()

> **register**(`entry`): [`VaultEntry`](../interfaces/VaultEntry.md)

Defined in: [packages/core/src/mask/vault.ts:56](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L56)

Register a new masked value. The caller (the masker) has already
resolved consistency — `register` throws on a duplicate original or
replacement rather than silently merging, because reaching that point
means the masker's lookup logic is broken and restoration would be
ambiguous.

#### Parameters

##### entry

`Omit`\<[`VaultEntry`](../interfaces/VaultEntry.md), `"id"` \| `"createdAt"`\>

#### Returns

[`VaultEntry`](../interfaces/VaultEntry.md)

***

### replacements()

> **replacements**(): readonly `string`[]

Defined in: [packages/core/src/mask/vault.ts:125](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L125)

All current replacements (surrogates/tokens) — contains no originals;
 the restorer builds its match tables from this.

#### Returns

readonly `string`[]

***

### wouldCollide()

> **wouldCollide**(`value`): `boolean`

Defined in: [packages/core/src/mask/vault.ts:110](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/vault.ts#L110)

True when `value` is already in use as a replacement or an original —
 the collision check surrogate selection runs before committing.

#### Parameters

##### value

`string`

#### Returns

`boolean`
