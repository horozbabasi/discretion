/**
 * SPAN HYGIENE — a standing invariant, and a prerequisite for fusion.
 *
 * Stage 4 resolves overlapping candidates, and containment-based resolution is
 * only ever as safe as the covering span is correct. A span that has swallowed
 * a neighbouring CSV cell does not merely carry a wrong label: masking
 * OVERWRITES the span, so an over-long one destroys the user's adjacent data,
 * and a containment rule reading it would suppress whatever it wrongly covers.
 *
 * The M7 error taxonomy named this its highest-priority residual and measured
 * 31 offending candidates in the URI family. This test is that measurement
 * turned into a gate, so the class cannot come back silently.
 *
 * Two types are exempt BY CONSTRUCTION, not by concession: a PEM private key
 * block and a passport MRZ are inherently multi-line, and their canonical form
 * is the whole block. Everything else is a single field.
 */
import { describe, expect, it } from 'vitest';

import { normalize, runStage1 } from '@privacyshield/core';
import { generateCorpus } from '../src/corpus/builder.js';
import { generateHardNegatives } from '../src/corpus/hardNegatives.js';

/** Types whose canonical written form genuinely spans several lines. */
const MULTILINE_BY_DESIGN = new Set(['pem-private-key', 'passport-mrz']);

interface Offence {
  readonly detectorId: string;
  readonly reason: string;
  readonly sample: string;
}

function auditSpans(): Offence[] {
  const docs = [
    ...generateCorpus({ documents: 400, seed: 0xc0ffee }),
    ...generateHardNegatives({ documents: 150, seed: 0xbeef }),
  ];

  const offences: Offence[] = [];
  for (const doc of docs) {
    const normalization = normalize(doc.text);
    for (const candidate of runStage1(normalization)) {
      const text = normalization.normalizedText.slice(candidate.start, candidate.end);
      const note = (reason: string): void => {
        // The sample is a SHAPE, not the value: this file must not print a
        // secret into CI output.
        offences.push({ detectorId: candidate.detectorId, reason, sample: `${text.length} chars` });
      };

      if (!MULTILINE_BY_DESIGN.has(candidate.detectorId) && /[\n\r]/.test(text)) {
        note('crosses a line boundary');
      } else if (/,\s*\S+,/.test(text)) {
        note('contains interior CSV separators');
      } else if (text !== text.trim()) {
        note('has leading or trailing whitespace');
      } else if (/[|;,]$/.test(text)) {
        note('ends on a field delimiter');
      }
    }
  }
  return offences;
}

describe('span hygiene', () => {
  it('emits no span that has swallowed a neighbouring field', () => {
    const offences = auditSpans();
    const summary = offences.map((o) => `${o.detectorId}: ${o.reason} (${o.sample})`);
    expect(summary, summary.slice(0, 10).join('; ')).toEqual([]);
  });

  it('stops a credentialled URI at a CSV cell boundary', () => {
    // The case that motivated the fix: the span used to run on through
    // ",QIVJLC79,ok", so masking it would have overwritten two more cells.
    const row = 'id,url,code\n2,postgres://app:pw0rd@prod-db.corp:5432/appdb,QIVJLC79,ok';
    const normalization = normalize(row);
    const uri = runStage1(normalization).find((c) => c.type === 'URL_WITH_CREDENTIALS');

    expect(uri).toBeDefined();
    expect(uri!.text).toBe('postgres://app:pw0rd@prod-db.corp:5432/appdb');
    expect(uri!.text).not.toContain(',');
  });

  it('keeps a JDBC connection string whole, semicolons and all', () => {
    // ';' is deliberately not a terminator: JDBC carries its properties after
    // one, and cutting there would truncate the credential.
    const jdbc = 'url=jdbc:sqlserver://sql01.corp.local:1433;databaseName=hr';
    const found = runStage1(normalize(jdbc));
    // Whatever claims it must not stop mid-property.
    for (const c of found) expect(c.text.endsWith(';')).toBe(false);
  });

  it('leaves a multi-line PEM block and an MRZ intact', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
      'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const found = runStage1(normalize(pem)).find((c) => c.detectorId === 'pem-private-key');
    expect(found).toBeDefined();
    // The whole block is the identifier; truncating at the first newline
    // would leave most of the key unmasked.
    expect(found!.text).toContain('BEGIN');
    expect(found!.text).toContain('END');
  });
});
