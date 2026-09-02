/**
 * Stage 3 document profiling.
 *
 * SPEC.md: "detect whether input is prose, source code (and which language),
 * JSON, YAML, CSV, a log dump, a markdown table, or an email thread. Each mode
 * shifts weights. Code mode raises secret sensitivity and lowers person-name
 * sensitivity."
 *
 * That last clause is why a format misclassification is not cosmetic: calling
 * ordinary prose "code" quietly lowers the confidence of every person name in
 * it. The prose cases below are guards against exactly that.
 */
import { describe, expect, it } from 'vitest';
import { DOMAIN_LEXICONS } from '@discretion/data';
import { profileDocument } from '../src/context/documentProfile.js';

const profile = (text: string) => profileDocument(text, { domainLexicon: DOMAIN_LEXICONS });

describe('profileDocument — format', () => {
  const cases: readonly [string, string, string][] = [
    ['source code', 'const apiKey = process.env.KEY;\nfunction load() {\n  return fetch(url);\n}', 'code'],
    ['json', '{\n  "api_key": "sk-abc",\n  "note": "x"\n}', 'json'],
    ['yaml', 'service:\n  db_password: hunter2\n  replicas: 3\n', 'yaml'],
    ['csv', 'id,ssn,city\n1,123-45-6789,NYC\n2,987-65-4321,LA', 'csv'],
    ['log dump', '2026-08-26T09:12:44Z INFO request ok\n2026-08-26T09:12:45Z WARN retry', 'log'],
    ['markdown table', '| field | value |\n| --- | --- |\n| token | abc |', 'markdown-table'],
    ['email thread', 'From: a@example.com\nTo: b@example.com\nSubject: Hi\n\nHello.', 'email'],
    ['prose', 'The meeting was moved to Thursday and everyone agreed to the new schedule.', 'prose'],
  ];

  for (const [label, text, expected] of cases) {
    it(`classifies ${label}`, () => {
      expect(profile(text).format).toBe(expected);
    });
  }

  it('does not call prose "code" because it borrowed an English keyword', () => {
    // `new`, `for`, `from`, `if`, `return` and `class` are ordinary English.
    // Treating them as code evidence lowered person-name sensitivity on
    // ordinary sentences, which costs recall on exactly the type it hurts most.
    for (const sentence of [
      'Everyone agreed to the new schedule for the class trip.',
      'If you return the form from reception, I will file it.',
      'The public meeting was static and nobody tried to import anything.',
    ]) {
      expect(profile(sentence).format).toBe('prose');
    }
  });

  it('reports the evidence that decided the format', () => {
    expect(profile('id,a,b\n1,2,3\n4,5,6').formatEvidence.length).toBeGreaterThan(0);
  });
});

describe('profileDocument — domain', () => {
  it('detects the subject domain independently of the format', () => {
    expect(profile('Patient presented with elevated HbA1c. Diagnosis confirmed, dosage adjusted.').domain).toBe('medical');
    expect(profile('This contract between the parties establishes jurisdiction per clause 4.').domain).toBe('legal');
    expect(profile('Invoice 4471 payment received; the account balance is attached.').domain).toBe('financial');
  });

  it('leaves ordinary text as general', () => {
    expect(profile('The meeting was moved to Thursday and everyone agreed.').domain).toBe('general');
  });

  it('matches domain terms as whole words', () => {
    // "lan" was matching inside "balance" and counting as financial vocabulary.
    const p = profile('The meeting was moved to Thursday and everyone agreed.');
    expect(p.domainEvidence).toEqual([]);
  });

  it('reports domain evidence as lexicon terms only', () => {
    const p = profile('Patient presented with elevated HbA1c. Diagnosis confirmed, dosage adjusted.');
    expect(p.domainEvidence.length).toBeGreaterThan(0);
    // Explanations must never echo document content beyond the matched term.
    for (const term of p.domainEvidence) expect(term.length).toBeLessThan(40);
  });
});
