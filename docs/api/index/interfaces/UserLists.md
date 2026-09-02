[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / UserLists

# Interface: UserLists

Defined in: [packages/core/src/fuse/profiles.ts:125](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/profiles.ts#L125)

A user's own additions to whatever profile is active.

## Properties

### allow?

> `readonly` `optional` **allow?**: readonly `string`[]

Defined in: [packages/core/src/fuse/profiles.ts:130](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/profiles.ts#L130)

Never mask these. Matched case- and whitespace-insensitively on the
entity's text — a user's own employer name, say.

***

### deny?

> `readonly` `optional` **deny?**: readonly `string`[]

Defined in: [packages/core/src/fuse/profiles.ts:132](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/profiles.ts#L132)

Always mask these, whatever the profile or confidence says.
