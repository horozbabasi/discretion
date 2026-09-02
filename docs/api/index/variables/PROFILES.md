[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / PROFILES

# Variable: PROFILES

> `const` **PROFILES**: `Readonly`\<`Record`\<`Exclude`\<[`ProfileName`](../type-aliases/ProfileName.md), `"custom"`\>, [`SensitivityProfile`](../interfaces/SensitivityProfile.md)\>\>

Defined in: [packages/core/src/fuse/profiles.ts:107](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/profiles.ts#L107)

The three named profiles.

Thresholds differ by INTENT, not by tuning. Minimal exists for a developer
who wants surgical protection and would rather miss a weak signal than see
a spurious one, so it demands high confidence. Strict exists for someone who
would rather over-mask, so it deliberately admits low-confidence candidates
— SPEC names "low-confidence candidates" as part of what Strict adds.
