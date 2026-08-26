/**
 * examples.ts — loadable example documents, produced by the M3 corpus
 * generator rather than hand-written (the milestone's explicit rule). The
 * corpus is deterministic for a fixed seed, so every visitor sees the same
 * examples; the CRITERIA below select for coverage — scripts, languages,
 * document types — and the picks are curation logic, not curated text.
 *
 * Generation runs client-side at startup: the generator is plain TypeScript
 * with no Node dependencies, ~160 documents cost single-digit milliseconds,
 * and bundling code instead of frozen JSON keeps the examples honest — they
 * can never drift from what the eval corpus actually produces.
 */

import { LANGUAGES, generateCorpus } from '@privacyshield/eval';
import type { LabeledDocument } from '@privacyshield/eval';

/** Pinned so the playground shows the same examples on every load. */
const EXAMPLES_SEED = 7;
const CORPUS_SIZE = 160;
const MIN_ENTITIES = 2;
const MIN_LENGTH = 180;
const MAX_LENGTH = 1400;

interface Criterion {
  readonly languages: readonly string[];
  readonly docTypes: readonly string[];
}

/**
 * One example per criterion, first match wins. Ordered for breadth:
 * Latin (en, tr, fr), Cyrillic (ru/uk), Arabic script (fa/ar), Hangul/Han/
 * Kana (ko/ja/zh), Devanagari/Thai (hi/th), and a structured-document
 * flavour (markdown table / email) to round out the document types.
 */
const CRITERIA: readonly Criterion[] = [
  { languages: ['en'], docTypes: ['prose', 'email'] },
  { languages: ['tr'], docTypes: ['email', 'prose'] },
  { languages: ['fr', 'de'], docTypes: ['code'] },
  { languages: ['ru', 'uk'], docTypes: ['email', 'prose'] },
  { languages: ['fa', 'ar', 'he'], docTypes: ['prose', 'csv'] },
  { languages: ['ko', 'ja', 'zh'], docTypes: ['medical', 'csv', 'log'] },
  { languages: ['hi', 'th'], docTypes: ['log', 'yaml', 'csv'] },
  { languages: ['fi', 'sv', 'da'], docTypes: ['markdown-table', 'email'] },
];

export interface Example {
  readonly id: string;
  /** e.g. 'Turkish · email' */
  readonly title: string;
  readonly language: string;
  readonly docType: string;
  readonly text: string;
}

function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

function usable(doc: LabeledDocument): boolean {
  return (
    !doc.hardNegative &&
    doc.entities.length >= MIN_ENTITIES &&
    doc.text.length >= MIN_LENGTH &&
    doc.text.length <= MAX_LENGTH
  );
}

/** Deterministic: same seed, same corpus, same picks, every call. */
export function buildExamples(): Example[] {
  const docs = generateCorpus({ documents: CORPUS_SIZE, seed: EXAMPLES_SEED, minPerKind: 0 });
  const candidates = docs.filter(usable);
  const taken = new Set<string>();
  const examples: Example[] = [];

  for (const criterion of CRITERIA) {
    const match = candidates.find(
      (d) =>
        !taken.has(d.id) &&
        criterion.languages.includes(d.language) &&
        criterion.docTypes.includes(d.docType),
    );
    if (match === undefined) continue;
    taken.add(match.id);
    examples.push({
      id: match.id,
      title: `${languageName(match.language)} · ${match.docType}`,
      language: match.language,
      docType: match.docType,
      text: match.text,
    });
  }
  return examples;
}
