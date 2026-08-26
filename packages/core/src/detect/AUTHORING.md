# Writing a Stage 1 detector

Read this instead of re-reading SPEC.md. It is the whole contract.

## One detector = one file

`src/detect/detectors/<family>/<name>.ts` — exports nothing, self-registers:

```ts
registerDetector({
  id: 'national-id-tr-tckn',       // kebab-case, unique, never churns
  entityType: 'NATIONAL_ID',       // existing member — never add one
  regions: ['TR'],                 // ISO alpha-2, or [GLOBAL_REGION]
  pattern: /\b[1-9]\d{10}\b/g,     // MUST have /g. Over-generate.
  baseConfidence: CONFIDENCE.HIGH, // reached only when validate() passes
  description: 'One line.',
  validate(ctx) {                  // ctx: text/start/end/match/defaultRegion
    if (bad) return invalid('checksum failed'); // candidate DROPPED
    return valid({ canonical, metadata: { scheme: 'tckn', country: 'TR' },
                   validator: 'tckn-mod-10' });
  },
});
```

Imports: `registerDetector` from `../../registry.js`; `CONFIDENCE`,
`GLOBAL_REGION`, `invalid`, `valid` from `../../types.js`. Then add one line
to the family barrel: `import './tckn.js';`

## Rules

- Reuse `src/checksums/`. Missing algorithm → add it there with tests.
- Wrong checksum = `invalid()`, not low confidence. No-checksum formats cap
  at LOW/MEDIUM; context-dependent ones set `requiresContext: true`.
- Known test/doc values: `valid({ sensitive: false })`.
- No stubs, no truncated tables. Never put a matched value in a reason.
- Strict TS; no DOM/Node globals in core; `.js` on relative imports.

## Tests (`test/detectors-<family>.test.ts`) — per detector

1. ≥3 valid vectors (published specimens preferred).
2. Invalid vectors OUTNUMBERING valid: wrong check digit, transposition,
   wrong length (short+long), wrong charset/prefix, cross-scheme near-miss.
3. Property test: paired generator in `test/generators/<family>.ts` —
   `generateValidX(seed): string`, deterministic, must NOT call the
   validator. Generated always validates; single-char mutation fails (skip
   mutation only for checksum-less formats — say so in a comment).
4. Offset test: `runStage1(normalize(...))` with the value mid-sentence;
   original span re-normalizes to exactly the value.

Generators are reused by M3's corpus builder — export them cleanly.
