/**
 * Report rendering: the eval result as human-readable markdown, with the
 * error analysis (worst false positives and every recorded false negative
 * with context) that makes failures diagnosable rather than just counted.
 */

import type { EvalResult, TypeMetrics } from './metrics.js';

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const ms = (x: number): string => `${x.toFixed(2)}ms`;

function metricsTable(rows: Readonly<Record<string, TypeMetrics>>, keyHeader: string): string {
  const lines = [
    `| ${keyHeader} | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |`,
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [key, m] of Object.entries(rows)) {
    lines.push(
      `| ${key} | ${m.groundTruth} | ${m.predictions} | ${pct(m.precision)} | ${pct(m.recallPartial)} | ${pct(m.recallExact)} | ${pct(m.f1)} | ${m.falsePositives} | ${m.falseNegatives} |`,
    );
  }
  return lines.join('\n');
}

/** Render the full baseline report as markdown. */
export function renderReport(result: EvalResult, title: string): string {
  const parts: string[] = [];
  parts.push(`# ${title}\n`);
  parts.push(
    `Corpus: ${result.documents} documents, ${result.groundTruthEntities} ground-truth entities, ` +
      `${result.predictions} sensitive predictions. Mean document length ${result.latencyMs.meanDocLength} chars.\n`,
  );
  parts.push(
    '**This corpus is synthetic.** Values are generator-made, carriers are template sentences, and ' +
      'hard negatives are constructed categories. The numbers measure the detectors against this ' +
      'corpus, not against real-world text; real-world performance will differ, most likely downward ' +
      'on precision for the context-free detectors.\n',
  );

  parts.push('## Per entity type\n');
  parts.push(metricsTable(result.byType, 'type'));

  parts.push('\n## Per language\n');
  parts.push(metricsTable(result.byLanguage, 'language'));

  parts.push('\n## Raw confidence vs. empirical precision (NOT calibration)\n');
  parts.push(
    'Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 ' +
      'fusion (M8). This is a first look only.\n',
  );
  parts.push('| bucket | predictions | matched | precision |');
  parts.push('| --- | ---: | ---: | ---: |');
  for (const [bucket, b] of Object.entries(result.byConfidence)) {
    parts.push(`| ${bucket} | ${b.predictions} | ${b.matched} | ${pct(b.precision)} |`);
  }

  parts.push('\n## Hard-negative false positives by category\n');
  const cats = Object.entries(result.hardNegativeFalsePositivesByCategory);
  if (cats.length === 0) {
    parts.push('None.');
  } else {
    parts.push('| category | sensitive detections (all FP) |');
    parts.push('| --- | ---: |');
    for (const [cat, n] of cats) parts.push(`| ${cat} | ${n} |`);
  }

  parts.push(
    `\n## Latency\n\np50 ${ms(result.latencyMs.p50)} · p95 ${ms(result.latencyMs.p95)} · ` +
      `p99 ${ms(result.latencyMs.p99)} · max ${ms(result.latencyMs.max)} per document ` +
      `(normalize + all detectors).\n`,
  );

  parts.push('## Worst false positives (highest confidence first)\n');
  if (result.falsePositives.length === 0) parts.push('None recorded.');
  for (const fp of result.falsePositives.slice(0, 30)) {
    parts.push(
      `- **${fp.type}** \`${fp.detectorId}\` conf ${fp.confidence} in ${fp.docId} (${fp.language}/${fp.docType})` +
        `${fp.hardNegativeCategory !== undefined ? ` [${fp.hardNegativeCategory}]` : ''}\n  ` +
        `\`…${fp.context}…\``,
    );
  }

  parts.push('\n## False negatives (missed ground truth)\n');
  if (result.falseNegatives.length === 0) parts.push('None recorded.');
  for (const fn of result.falseNegatives.slice(0, 30)) {
    parts.push(
      `- **${fn.type}** scheme \`${fn.scheme}\`${fn.obfuscated ? ' (obfuscated)' : ''} in ${fn.docId} ` +
        `(${fn.language}/${fn.docType})\n  \`…${fn.context}…\``,
    );
  }

  return parts.join('\n') + '\n';
}
