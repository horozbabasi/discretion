# PrivacyShield

Local-first PII detection and masking.

> **Status: milestone M1.** This README is a placeholder; it gets written properly at M11.

Monorepo layout:

- `packages/core` — detection pipeline library (M1: shared types, script detection, Stage 0 normalization with an exact bidirectional offset map)
- `packages/data` — generated Unicode data (M1: confusables table)
- `packages/eval` — evaluation harness (placeholder)
- `packages/extension` — browser extension (placeholder)
- `packages/web` — web playground (placeholder)

## Development

Requires Node 20+ (pinned via `.nvmrc`).

```sh
npm install
npm run build      # tsc project-references build
npm test           # vitest (unit + property + fuzz)
npm run lint
npm run bench      # normalization throughput benchmark
```
