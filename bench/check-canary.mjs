/**
 * Is this machine in the slow state right now?
 *
 * Prints one JSON object and exits 1 when the machine is degraded, so a
 * benchmark runner can refuse to publish a figure taken during it. See
 * ARCHITECTURE.md D27a and `machine-canary.mjs`.
 *
 * Run:  node bench/check-canary.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureCanary, scoreCanary, DEGRADED_RATIO } from './machine-canary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

let baseline = null;
let calibratedAt = null;
try {
  const record = JSON.parse(readFileSync(join(HERE, 'machine-canary.json'), 'utf8'));
  baseline = record.baselineMs ?? null;
  calibratedAt = record.calibratedAt ?? null;
} catch {
  // No calibration on this machine. scoreCanary reports 'unknown' rather than
  // 'healthy' - a missing baseline must not read as a passing one.
}

const reading = measureCanary();
const score = scoreCanary(reading.ms, baseline);

console.log(
  JSON.stringify(
    {
      verdict: score.verdict,
      canaryMs: Number(reading.ms.toFixed(4)),
      baselineMs: baseline,
      ratio: score.ratio === null ? null : Number(score.ratio.toFixed(3)),
      degradedAtRatio: DEGRADED_RATIO,
      calibratedAt,
    },
    null,
    1,
  ),
);

// Exit code carries the verdict so a shell runner needs no parsing. 'unknown'
// is NOT an error: an uncalibrated machine can still take measurements, it
// just cannot say which state it was in - and saying so is the whole point.
process.exit(score.verdict === 'degraded' ? 1 : 0);
