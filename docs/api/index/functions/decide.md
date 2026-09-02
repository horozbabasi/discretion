[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / decide

# Function: decide()

> **decide**(`entity`, `profileIn`, `lists?`): [`ProfileDecision`](../interfaces/ProfileDecision.md)

Defined in: [packages/core/src/fuse/profiles.ts:155](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L155)

Decide whether one entity is reported under a profile.

ORDER IS THE WHOLE CONTRACT, and it follows SPEC exactly: "Denylist beats
everything." A denylisted value is reported even when its type is out of
profile and even when confidence is far below threshold — it is the one
override a user can state absolutely. The allowlist is checked next, before
type and threshold, so that suppressing a value the user has vouched for
does not depend on which profile happens to be active.

## Parameters

### entity

#### calibratedConfidence

`number`

#### text

`string`

#### type

[`EntityType`](../type-aliases/EntityType.md)

### profileIn

[`SensitivityProfile`](../interfaces/SensitivityProfile.md)

### lists?

[`UserLists`](../interfaces/UserLists.md) = `{}`

## Returns

[`ProfileDecision`](../interfaces/ProfileDecision.md)
