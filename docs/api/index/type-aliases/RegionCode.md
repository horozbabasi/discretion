[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / RegionCode

# Type Alias: RegionCode

> **RegionCode** = `string`

Defined in: [packages/core/src/detect/types.ts:68](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L68)

An ISO 3166-1 alpha-2 country code, or `GLOBAL` for detectors that are not
jurisdiction-specific (email, IP address, JWT, credit card).

Kept as a widened string rather than a closed union so adding a country
genuinely touches one file. The registry validates the shape at
registration time.
