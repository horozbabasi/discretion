[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / NEGATIVE\_RULES

# Variable: NEGATIVE\_RULES

> `const` **NEGATIVE\_RULES**: readonly [`NegativeRule`](../interfaces/NegativeRule.md)[]

Defined in: [packages/core/src/context/negativeRules.ts:726](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/negativeRules.ts#L726)

The full rule set, in evaluation order.

Order is not significant for correctness — every rule is evaluated and the
strongest action wins — but keeping the conclusive structural rules first
makes traces easier to read.
