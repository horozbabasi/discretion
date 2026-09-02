[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / DocumentProfile

# Interface: DocumentProfile

Defined in: [packages/core/src/context/types.ts:91](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L91)

What Stage 3 learned about the document as a whole.

## Properties

### domain

> `readonly` **domain**: [`DocumentDomain`](../type-aliases/DocumentDomain.md)

Defined in: [packages/core/src/context/types.ts:93](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L93)

***

### domainEvidence

> `readonly` **domainEvidence**: readonly `string`[]

Defined in: [packages/core/src/context/types.ts:97](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L97)

Domain terms that matched, for reporting. Lexicon terms only.

***

### format

> `readonly` **format**: [`DocumentFormat`](../type-aliases/DocumentFormat.md)

Defined in: [packages/core/src/context/types.ts:92](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L92)

***

### formatEvidence

> `readonly` **formatEvidence**: readonly `string`[]

Defined in: [packages/core/src/context/types.ts:95](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L95)

Signals that decided the format, for reporting and debugging.
