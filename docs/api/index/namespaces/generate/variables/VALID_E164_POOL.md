[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [generate](../README.md) / VALID\_E164\_POOL

# Variable: VALID\_E164\_POOL

> `const` **VALID\_E164\_POOL**: readonly `string`[]

Defined in: [packages/core/src/generate/contact.ts:52](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/generate/contact.ts#L52)

Known-valid E.164 numbers across plans and regions. Sources: numbers in
ranges reserved for fiction/drama (UK Ofcom 7946 09xx, US 555-01xx) and
carrier example shapes that satisfy libphonenumber's full-metadata
isValid(). The pool is itself pinned by a test, so a metadata update that
invalidates an entry fails loudly there rather than silently in the
property test.
