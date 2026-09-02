[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / CodePointClass

# Type Alias: CodePointClass

> **CodePointClass** = [`ScriptName`](ScriptName.md) \| `"neutral"`

Defined in: [packages/core/src/scripts.ts:50](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/scripts.ts#L50)

Classification of one code point:
 - 'neutral'   — not a letter (whitespace, digits, punctuation, symbols,
                 combining marks, controls). Ignored for dominance because
                 it would skew the result.
 - a ScriptName — a letter of that script ('other' for unsupported scripts).
