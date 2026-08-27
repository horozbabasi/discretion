/**
 * Stage 3 scoring: co-occurrence and repetition.
 *
 * SPEC.md, Stage 3:
 *   "CO-OCCURRENCE — several candidates of complementary types near each other
 *    (name, then address, then phone) mutually reinforce; that shape is a
 *    contact record."
 *   "REPETITION — a string appearing many times in a technical document is
 *    more likely a variable than a person."
 *
 * Co-occurrence is the ONE signal in Stage 3 that legitimately reads other
 * candidates, and the tests below pin the property that keeps it from becoming
 * overlap resolution by the back door: it can only ever RAISE a score.
 */
import { describe, expect, it } from 'vitest';
import { analyzeContext } from '../src/context/score.js';
import type { PipelineCandidate } from '../src/context/types.js';
import type { EntityType } from '../src/types.js';

/** A candidate positioned at the first occurrence of `value` in `text`. */
function candidate(text: string, value: string, type: EntityType): PipelineCandidate {
  const start = text.indexOf(value);
  expect(start, `fixture must contain ${value}`).toBeGreaterThanOrEqual(0);
  return {
    text: value,
    type,
    start,
    end: start + value.length,
    originalStart: start,
    originalEnd: start + value.length,
    rawConfidence: 0.5,
    stage: 'stage1-validated-identifier',
    detectorId: `test-${type.toLowerCase()}`,
    sensitive: true,
    canonical: value,
  };
}

function score(text: string, candidates: readonly PipelineCandidate[]) {
  return analyzeContext(text).score(candidates);
}

/** The signal names contributing to the first candidate's score. */
function signalsFor(text: string, candidates: readonly PipelineCandidate[], index = 0): string[] {
  const scored = score(text, candidates)[index];
  expect(scored).toBeDefined();
  return scored!.contributions.map((c) => c.signal);
}

describe('co-occurrence', () => {
  const contactRecord =
    'Jane Miller\n42 Oak Street, Springfield\n+1 555 0147\njane.miller@example.com\n';

  it('reinforces complementary types that form a contact record', () => {
    const candidates = [
      candidate(contactRecord, 'Jane Miller', 'PERSON'),
      candidate(contactRecord, '42 Oak Street, Springfield', 'STREET_ADDRESS'),
      candidate(contactRecord, '+1 555 0147', 'PHONE'),
      candidate(contactRecord, 'jane.miller@example.com', 'EMAIL'),
    ];
    expect(signalsFor(contactRecord, candidates)).toContain('cooccurrence:contact-record');
  });

  it('needs more than one complementary type, so a lone candidate gains nothing', () => {
    const alone = 'Jane Miller wrote the report.\n';
    const candidates = [candidate(alone, 'Jane Miller', 'PERSON')];
    expect(signalsFor(alone, candidates)).not.toContain('cooccurrence:contact-record');
  });

  it('does not reinforce across a distance that is no longer one record', () => {
    const far = `Jane Miller\n${'filler text. '.repeat(40)}\n+1 555 0147\njane.miller@example.com\n`;
    const candidates = [
      candidate(far, 'Jane Miller', 'PERSON'),
      candidate(far, '+1 555 0147', 'PHONE'),
      candidate(far, 'jane.miller@example.com', 'EMAIL'),
    ];
    expect(signalsFor(far, candidates)).not.toContain('cooccurrence:contact-record');
  });

  it('only ever raises a score, never lowers or suppresses', () => {
    // This is the property that keeps the one cross-candidate signal in Stage 3
    // from turning into Stage 4's overlap resolution.
    const scored = score(contactRecord, [
      candidate(contactRecord, 'Jane Miller', 'PERSON'),
      candidate(contactRecord, '+1 555 0147', 'PHONE'),
      candidate(contactRecord, 'jane.miller@example.com', 'EMAIL'),
    ]);
    for (const entry of scored) {
      const cooccurrence = entry.contributions.filter((c) => c.signal.startsWith('cooccurrence:'));
      for (const c of cooccurrence) expect(c.delta).toBeGreaterThan(0);
      expect(entry.suppressed).toBe(false);
    }
  });
});

describe('repetition', () => {
  // The CANDIDATE text is what repeats here, not the variable holding it:
  // the rule keys on the candidate and needs four or more occurrences.
  const code = [
    'const Madrid = loadRegion("Madrid");',
    'log(Madrid);',
    'if (Madrid.active) { emit(Madrid); }',
    'return Madrid;',
  ].join('\n');

  it('penalises a name repeated through a technical document', () => {
    const candidates = [candidate(code, 'Madrid', 'LOCATION')];
    expect(signalsFor(code, candidates)).toContain('repetition:technical-document');
  });

  it('applies the penalty as a reduction, not a suppression', () => {
    const scored = score(code, [candidate(code, 'Madrid', 'LOCATION')])[0];
    expect(scored).toBeDefined();
    const penalty = scored!.contributions.find((c) => c.signal === 'repetition:technical-document');
    expect(penalty?.delta).toBeLessThan(0);
    expect(scored!.suppressed).toBe(false);
  });

  it('leaves prose alone: repetition there is emphasis, not a variable', () => {
    const prose =
      'Madrid was warm. We walked through Madrid all afternoon, and Madrid at dusk was quiet. Madrid again tomorrow.';
    expect(signalsFor(prose, [candidate(prose, 'Madrid', 'LOCATION')])).not.toContain(
      'repetition:technical-document',
    );
  });

  it('ignores a name that appears only once in code', () => {
    const once = 'const city = "Lisbon";\nlog(city);\n';
    expect(signalsFor(once, [candidate(once, 'Lisbon', 'LOCATION')])).not.toContain(
      'repetition:technical-document',
    );
  });
});

describe('scoring — explanation hygiene', () => {
  it('never echoes the candidate value into a contribution detail', () => {
    // SPEC.md's third non-negotiable: explanations flow into reports and UI,
    // and must stay free of sensitive values.
    const doc = 'api_key = sk-live-9f3aQ2xLp0ZmR8vT\n';
    const scored = score(doc, [candidate(doc, 'sk-live-9f3aQ2xLp0ZmR8vT', 'API_KEY')])[0];
    expect(scored).toBeDefined();
    for (const contribution of scored!.contributions) {
      expect(contribution.detail ?? '').not.toContain('sk-live-9f3aQ2xLp0ZmR8vT');
    }
  });

  it('decomposes the adjusted score into its named contributions', () => {
    const doc = 'api_key = sk-live-9f3aQ2xLp0ZmR8vT\n';
    const scored = score(doc, [candidate(doc, 'sk-live-9f3aQ2xLp0ZmR8vT', 'API_KEY')])[0];
    expect(scored).toBeDefined();
    const total = scored!.contributions.reduce((sum, c) => sum + c.delta, 0.5);
    expect(scored!.contextConfidence).toBeCloseTo(Math.min(1, Math.max(0, total)), 10);
  });
});
