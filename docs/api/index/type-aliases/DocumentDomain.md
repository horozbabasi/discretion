[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / DocumentDomain

# Type Alias: DocumentDomain

> **DocumentDomain** = `"medical"` \| `"legal"` \| `"financial"` \| `"general"`

Defined in: [packages/core/src/context/types.ts:59](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L59)

The SUBJECT DOMAIN of a document, detected from terminology.

Kept as a second, independent axis rather than folded into the format
union: a medical record can arrive as prose, as CSV, or as a JSON payload,
and collapsing the two would force a false choice. SPEC.md lists "medical,
legal, and financial terminology used for context scoring" under the
gazetteers, which is what feeds this.
