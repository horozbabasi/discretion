[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / SensitivityProfile

# Interface: SensitivityProfile

Defined in: [packages/core/src/fuse/profiles.ts:74](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L74)

## Properties

### name

> `readonly` **name**: [`ProfileName`](../type-aliases/ProfileName.md)

Defined in: [packages/core/src/fuse/profiles.ts:75](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L75)

***

### threshold

> `readonly` **threshold**: (`type`) => `number`

Defined in: [packages/core/src/fuse/profiles.ts:82](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L82)

Minimum CALIBRATED confidence to report, per type, with a default.
Meaningful only because Stage 4 calibrated the scale (D23).

#### Parameters

##### type

[`EntityType`](../type-aliases/EntityType.md)

#### Returns

`number`

***

### types

> `readonly` **types**: `ReadonlySet`\<[`EntityType`](../type-aliases/EntityType.md)\>

Defined in: [packages/core/src/fuse/profiles.ts:77](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L77)

Types the profile reports at all.
