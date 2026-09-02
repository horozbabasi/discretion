[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / Restorer

# Class: Restorer

Defined in: [packages/core/src/mask/restorer.ts:47](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L47)

## Constructors

### Constructor

> **new Restorer**(`vault`, `options?`): `Restorer`

Defined in: [packages/core/src/mask/restorer.ts:59](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L59)

#### Parameters

##### vault

[`Vault`](Vault.md)

##### options?

[`RestorerOptions`](../interfaces/RestorerOptions.md) = `{}`

#### Returns

`Restorer`

## Accessors

### rendered

#### Get Signature

> **get** **rendered**(): `string`

Defined in: [packages/core/src/mask/restorer.ts:94](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L94)

Everything rendered so far.

##### Returns

`string`

***

### restoredCount

#### Get Signature

> **get** **restoredCount**(): `number`

Defined in: [packages/core/src/mask/restorer.ts:99](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L99)

How many surrogate occurrences have been restored.

##### Returns

`number`

## Methods

### finish()

> **finish**(): `string`

Defined in: [packages/core/src/mask/restorer.ts:86](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L86)

Flush the remainder; no more holding. Returns the final rendered text.

#### Returns

`string`

***

### push()

> **push**(`chunk`): `string`

Defined in: [packages/core/src/mask/restorer.ts:79](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/restorer.ts#L79)

Push the next stream chunk; returns the text newly rendered this call.

#### Parameters

##### chunk

`string`

#### Returns

`string`
