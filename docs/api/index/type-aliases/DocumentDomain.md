[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / DocumentDomain

# Type Alias: DocumentDomain

> **DocumentDomain** = `"medical"` \| `"legal"` \| `"financial"` \| `"general"`

Defined in: [packages/core/src/context/types.ts:59](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L59)

The SUBJECT DOMAIN of a document, detected from terminology.

Kept as a second, independent axis rather than folded into the format
union: a medical record can arrive as prose, as CSV, or as a JSON payload,
and collapsing the two would force a false choice. SPEC.md lists "medical,
legal, and financial terminology used for context scoring" under the
gazetteers, which is what feeds this.
