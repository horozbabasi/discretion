/**
 * The loadable examples come from the M3 corpus generator, not hand-written
 * text — these tests pin that they stay deterministic, span multiple
 * languages/scripts/document types, and actually light up under Stage 1.
 */

import { describe, expect, it } from 'vitest';

import { normalize, runStage1 } from '@privacyshield/core';
import { LANGUAGES } from '@privacyshield/eval';
import { buildExamples } from '../src/examples.js';

describe('buildExamples', () => {
  const examples = buildExamples();

  it('is deterministic across calls', () => {
    expect(buildExamples()).toEqual(examples);
  });

  it('provides several examples across distinct languages', () => {
    expect(examples.length).toBeGreaterThanOrEqual(6);
    const languages = new Set(examples.map((e) => e.language));
    expect(languages.size).toBe(examples.length);
  });

  it('spans at least four scripts and three document types', () => {
    const scripts = new Set(
      examples.map((e) => LANGUAGES.find((l) => l.code === e.language)?.script ?? 'unknown'),
    );
    const docTypes = new Set(examples.map((e) => e.docType));
    expect(scripts.size).toBeGreaterThanOrEqual(4);
    expect(docTypes.size).toBeGreaterThanOrEqual(3);
  });

  it('every example produces at least one Stage 1 detection', () => {
    for (const example of examples) {
      const candidates = runStage1(normalize(example.text));
      expect(candidates.length, `example ${example.id} (${example.title})`).toBeGreaterThan(0);
    }
  });

  it('titles read as "Language · docType"', () => {
    for (const example of examples) {
      expect(example.title).toMatch(/^.+ · .+$/);
      expect(example.text.length).toBeGreaterThan(100);
    }
  });
});
