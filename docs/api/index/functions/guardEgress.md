[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / guardEgress

# Function: guardEgress()

> **guardEgress**(`payload`, `auditor`): [`EgressVerdict`](../interfaces/EgressVerdict.md)

Defined in: [packages/core/src/mask/egressGuard.ts:64](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/egressGuard.ts#L64)

Scan `payload` for every plaintext original in the vault. The auditor is
the vault's single plaintext door (`vault.createEgressAuditor()`); this
function is its intended sole consumer.

## Parameters

### payload

`string`

### auditor

[`EgressAuditor`](../interfaces/EgressAuditor.md)

## Returns

[`EgressVerdict`](../interfaces/EgressVerdict.md)
