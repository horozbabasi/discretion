[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / NEGATIVE\_RULES

# Variable: NEGATIVE\_RULES

> `const` **NEGATIVE\_RULES**: readonly [`NegativeRule`](../interfaces/NegativeRule.md)[]

Defined in: [packages/core/src/context/negativeRules.ts:726](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/negativeRules.ts#L726)

The full rule set, in evaluation order.

Order is not significant for correctness — every rule is evaluated and the
strongest action wins — but keeping the conclusive structural rules first
makes traces easier to read.
