[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [generate](../README.md) / VALID\_E164\_POOL

# Variable: VALID\_E164\_POOL

> `const` **VALID\_E164\_POOL**: readonly `string`[]

Defined in: [packages/core/src/generate/contact.ts:52](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/generate/contact.ts#L52)

Known-valid E.164 numbers across plans and regions. Sources: numbers in
ranges reserved for fiction/drama (UK Ofcom 7946 09xx, US 555-01xx) and
carrier example shapes that satisfy libphonenumber's full-metadata
isValid(). The pool is itself pinned by a test, so a metadata update that
invalidates an entry fails loudly there rather than silently in the
property test.
