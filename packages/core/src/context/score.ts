/**
 * Stage 3, the scoring pass.
 *
 * SPEC.md: "Each candidate's confidence is adjusted by evidence from its
 * surroundings" — trigger proximity, structural cues, negative context,
 * document type, co-occurrence, and repetition.
 *
 * Every adjustment is a named, signed contribution, so the final number
 * always decomposes into the reasons that produced it (see `types.ts`).
 * The weights below are DELIBERATELY ROUND and are not tuned against the
 * evaluation corpus: Stage 3 orders evidence, Stage 4 (M8) calibrates it
 * into probabilities against held-out data. Tuning these by hand until the
 * corpus numbers looked good would produce exactly the self-fulfilling
 * measurement this project has refused since M3.
 *
 * ONE CROSS-CANDIDATE SIGNAL, BY DESIGN. Negative rules receive a
 * `RuleContext` that deliberately cannot see other candidates, because
 * reasoning about overlapping spans is Stage 4's overlap resolution.
 * Co-occurrence is the single exception SPEC.md explicitly calls for, and it
 * only ever REINFORCES — it can raise a candidate's confidence, never
 * suppress or reorder one. That asymmetry is what keeps it from becoming
 * overlap resolution by the back door.
 */

import type { EntityType } from '../types.js';
import type { ContextSignal } from '../detect/types.js';
import { buildStructureIndex, type StructureIndex, type StructuredSlot } from './structure.js';
import { buildTriggerIndex, foldForMatch, type LanguageTriggers, type TriggerIndex } from './triggers.js';
import { profileDocument, type DomainLexicon } from './documentProfile.js';
import { NEGATIVE_RULES, ruleApplies } from './negativeRules.js';
import type {
  ContextContribution,
  ContextScoredCandidate,
  DocumentFormat,
  DocumentProfile,
  PipelineCandidate,
  RuleContext,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Weights
// ─────────────────────────────────────────────────────────────────────────────

/** A label naming this entity type sits next to the candidate. */
const TRIGGER_ADJACENT = 0.25;
/** The same, but further away: evidence decays with distance. */
const TRIGGER_DISTANT = 0.1;
/** Distance in characters beyond which a trigger counts as distant. */
const TRIGGER_NEAR_CHARS = 16;

/**
 * The candidate is the value of a key that names this entity type.
 * SPEC.md calls this case "near-certain regardless of shape", which is why it
 * outweighs every other positive signal here.
 */
const STRUCTURE_KEY_MATCH = 0.35;
/** The candidate is a value in some key/value structure, key unrecognized. */
const STRUCTURE_ASSIGNMENT = 0.05;

/** Complementary types nearby: the shape of a contact record. */
const COOCCURRENCE = 0.1;
/** Distinct complementary types required before co-occurrence counts. */
const COOCCURRENCE_MIN_TYPES = 2;
/** How far apart candidates may be and still reinforce each other. */
const COOCCURRENCE_WINDOW = 240;

/** A name repeated through a technical document is likelier an identifier. */
const REPETITION_PENALTY = -0.2;
/** Occurrences before repetition counts as a signal. */
const REPETITION_MIN = 4;

/** Types that together suggest a contact record rather than coincidence. */
const CONTACT_RECORD: readonly EntityType[] = [
  'PERSON',
  'EMAIL',
  'PHONE',
  'STREET_ADDRESS',
  'POSTAL_CODE',
  'LOCATION',
  'DATE_OF_BIRTH',
  'NATIONAL_ID',
];

/** Names and places are usually identifiers, not people, in these formats. */
const TECHNICAL_FORMATS: readonly DocumentFormat[] = ['code', 'log', 'json', 'yaml', 'csv'];

/**
 * Per-format weight shifts.
 *
 * SPEC.md gives the governing example: "Code mode raises secret sensitivity
 * and lowers person-name sensitivity, since identifiers in code are usually
 * not people."
 */
const FORMAT_WEIGHTS: Partial<Record<DocumentFormat, Partial<Record<EntityType, number>>>> = {
  code: { GENERIC_SECRET: 0.1, API_KEY: 0.05, PRIVATE_KEY: 0.05, PERSON: -0.15, ORG: -0.1, LOCATION: -0.1 },
  log: { GENERIC_SECRET: 0.05, PERSON: -0.1, ORG: -0.05, LOCATION: -0.05 },
  json: { GENERIC_SECRET: 0.05, PERSON: -0.05 },
  yaml: { GENERIC_SECRET: 0.05, PERSON: -0.05 },
  email: { PERSON: 0.05, PHONE: 0.05 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextOptions {
  readonly triggerLexicons?: readonly LanguageTriggers[];
  readonly domainLexicon?: DomainLexicon;
}

export interface ContextAnalysis {
  readonly profile: DocumentProfile;
  readonly structure: StructureIndex;
  readonly triggers: TriggerIndex;
  /** Evidence for the Stage 1 runner's `contextFor` hook. */
  signalAt(start: number, end: number, type?: EntityType): ContextSignal | undefined;
  /** Adjust and filter a candidate set. */
  score(candidates: readonly PipelineCandidate[]): ContextScoredCandidate[];
}

const EMPTY_LEXICONS: readonly LanguageTriggers[] = [];

/**
 * Compiled trigger indexes, keyed by the lexicon array they came from.
 *
 * Compiling the bundled lexicons means folding roughly five thousand terms,
 * which is per-DOCUMENT work only if you let it be: measured at 27 ms per
 * document on the eval corpus, against 0.3 ms for the rest of Stage 3. The
 * lexicons are module constants, so the identity key is stable and the cache
 * holds one entry in practice. Weak so a caller passing a throwaway array —
 * a test, a tuning sweep — does not leak it.
 */
const triggerIndexCache = new WeakMap<readonly LanguageTriggers[], TriggerIndex>();

function triggerIndexFor(lexicons: readonly LanguageTriggers[]): TriggerIndex {
  const cached = triggerIndexCache.get(lexicons);
  if (cached !== undefined) return cached;
  const built = buildTriggerIndex(lexicons);
  triggerIndexCache.set(lexicons, built);
  return built;
}

interface Line {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function lineAt(text: string, offset: number): Line {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const newline = text.indexOf('\n', offset);
  const end = newline === -1 ? text.length : newline;
  return { text: text.slice(start, end), start, end };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Has another detector already positively identified these characters?
 *
 * Used ONLY to hold back GENERIC_SECRET's context requirement. The direction
 * matters: this signal can prevent a suppression, never cause one, so reading
 * the pre-suppression candidate set is conservative — a candidate that later
 * gets suppressed itself can only have made us keep more, not less.
 */
function isExplainedByOverlap(
  candidate: PipelineCandidate,
  all: readonly PipelineCandidate[],
): boolean {
  return all.some(
    (other) =>
      other !== candidate &&
      other.type !== candidate.type &&
      other.start < candidate.end &&
      candidate.start < other.end,
  );
}

/**
 * Analyse a document once, then score any number of candidate sets against it.
 *
 * The document-level work (structure index, format and domain profile,
 * trigger compilation) is the expensive part and is shared, which is what lets
 * Stage 1's inline `contextFor` hook and the Stage 3 post-pass draw on exactly
 * the same evidence rather than two divergent implementations.
 */
export function analyzeContext(text: string, options: ContextOptions = {}): ContextAnalysis {
  const structure = buildStructureIndex(text);
  const triggers = triggerIndexFor(options.triggerLexicons ?? EMPTY_LEXICONS);
  const profile = profileDocument(text, {
    structureIndex: structure,
    ...(options.domainLexicon !== undefined ? { domainLexicon: options.domainLexicon } : {}),
  });

  /** Does this slot's key name the given entity type? */
  function keyNames(slot: StructuredSlot, type: EntityType): boolean {
    const folded = foldForMatch(slot.key);
    if (folded.length === 0) return false;
    const matches = triggers.near(folded, folded.length, folded.length, folded.length + 1);
    return matches.some((m) => m.types.includes(type) && m.term === folded);
  }

  function signalAt(start: number, end: number, type?: EntityType): ContextSignal | undefined {
    const slot = structure.slotAt(start, end);
    const nearby = triggers.near(text, start, end);
    const relevant = type === undefined ? nearby : nearby.filter((m) => m.types.includes(type));
    const trigger = relevant[0]?.term;

    if (slot === undefined && trigger === undefined) return undefined;
    return {
      ...(trigger !== undefined ? { trigger } : {}),
      ...(slot !== undefined ? { assignment: true } : {}),
      documentType: profile.format,
    };
  }

  function score(candidates: readonly PipelineCandidate[]): ContextScoredCandidate[] {
    return candidates.map((candidate) => scoreOne(candidate, candidates));
  }

  function scoreOne(
    candidate: PipelineCandidate,
    all: readonly PipelineCandidate[],
  ): ContextScoredCandidate {
    const contributions: ContextContribution[] = [];
    const { type, start, end } = candidate;
    const line = lineAt(text, start);

    const suppression = applyNegativeRules(type, start, end, line, contributions);
    if (suppression !== undefined) {
      return {
        candidate,
        contextConfidence: 0,
        contributions,
        suppressed: true,
        suppressionReason: suppression,
      };
    }

    const slot = addStructureSignals(candidate, contributions);
    const hasTrigger = addTriggerSignals(candidate, contributions);
    addFormatSignal(type, contributions);
    addCooccurrence(candidate, all, contributions);
    addRepetition(candidate, contributions);

    // SPEC.md, GENERIC_SECRET: "Require a Shannon entropy threshold AND an
    // assignment-context signal … so that 'your-api-key-here', UUIDs, git
    // SHAs and base64 image data do not trigger." The conjunction is the
    // point: entropy alone is not evidence of a secret. Note the wording
    // differs deliberately from POSTAL_CODE and STREET_ADDRESS, which
    // "require context boost" — those stay emitted at low confidence and
    // context only raises them.
    //
    // With one exception, ratified after measurement (ARCHITECTURE.md D19):
    // a candidate whose span is ALREADY explained by another detector's
    // positive identification is left alone. Suppressing it would not be
    // Stage 3 removing a false positive — the characters are sensitive, and
    // some other detector says so — it would be Stage 3 pre-empting the
    // cross-type overlap resolution that belongs to Stage 4.
    if (type === 'GENERIC_SECRET' && slot === undefined && !hasTrigger && !isExplainedByOverlap(candidate, all)) {
      return {
        candidate,
        contextConfidence: 0,
        contributions,
        suppressed: true,
        suppressionReason: 'generic-secret-requires-assignment',
      };
    }

    const total = contributions.reduce((sum, c) => sum + c.delta, candidate.rawConfidence);
    return {
      candidate,
      contextConfidence: clamp01(total),
      contributions,
      suppressed: false,
    };
  }

  function applyNegativeRules(
    type: EntityType,
    start: number,
    end: number,
    line: Line,
    out: ContextContribution[],
  ): string | undefined {
    const ctx: RuleContext = { text, start, end, type, profile, line };
    for (const rule of NEGATIVE_RULES) {
      if (!ruleApplies(rule, type)) continue;
      if (!rule.test(ctx)) continue;
      if (rule.action === 'suppress') {
        out.push({ signal: `negative:${rule.id}`, delta: -1, detail: rule.id });
        return rule.id;
      }
      out.push({ signal: `negative:${rule.id}`, delta: rule.action, detail: rule.id });
    }
    return undefined;
  }

  function addStructureSignals(
    candidate: PipelineCandidate,
    out: ContextContribution[],
  ): StructuredSlot | undefined {
    const slot = structure.slotAt(candidate.start, candidate.end);
    if (slot === undefined) return undefined;

    if (keyNames(slot, candidate.type)) {
      // The key is a known lexicon term, so naming it leaks nothing.
      out.push({
        signal: `structure:key-names-${candidate.type}`,
        delta: STRUCTURE_KEY_MATCH,
        detail: foldForMatch(slot.key),
      });
      return slot;
    }

    // The key is arbitrary document text and must NOT be echoed into an
    // explanation; only the structural kind is safe to record.
    out.push({ signal: `structure:${slot.kind}`, delta: STRUCTURE_ASSIGNMENT });
    return slot;
  }

  function addTriggerSignals(candidate: PipelineCandidate, out: ContextContribution[]): boolean {
    const matches = triggers
      .near(text, candidate.start, candidate.end)
      .filter((m) => m.types.includes(candidate.type));
    const nearest = matches[0];
    if (nearest === undefined) return false;

    const delta = nearest.distance <= TRIGGER_NEAR_CHARS ? TRIGGER_ADJACENT : TRIGGER_DISTANT;
    out.push({ signal: `trigger:${candidate.type}`, delta, detail: nearest.term });
    return true;
  }

  function addFormatSignal(type: EntityType, out: ContextContribution[]): void {
    const delta = FORMAT_WEIGHTS[profile.format]?.[type];
    if (delta === undefined) return;
    out.push({ signal: `format:${profile.format}`, delta, detail: profile.format });
  }

  function addCooccurrence(
    candidate: PipelineCandidate,
    all: readonly PipelineCandidate[],
    out: ContextContribution[],
  ): void {
    if (!CONTACT_RECORD.includes(candidate.type)) return;

    const neighbours = new Set<EntityType>();
    for (const other of all) {
      if (other === candidate) continue;
      if (!CONTACT_RECORD.includes(other.type) || other.type === candidate.type) continue;
      const gap = other.start > candidate.end ? other.start - candidate.end : candidate.start - other.end;
      if (gap <= COOCCURRENCE_WINDOW) neighbours.add(other.type);
    }

    if (neighbours.size < COOCCURRENCE_MIN_TYPES) return;
    out.push({
      signal: 'cooccurrence:contact-record',
      delta: COOCCURRENCE,
      detail: `${neighbours.size} complementary types nearby`,
    });
  }

  function addRepetition(candidate: PipelineCandidate, out: ContextContribution[]): void {
    // SPEC.md: "a string appearing many times in a technical document is more
    // likely a variable than a person."
    if (!TECHNICAL_FORMATS.includes(profile.format)) return;
    if (!['PERSON', 'ORG', 'LOCATION'].includes(candidate.type)) return;

    const needle = candidate.text;
    if (needle.length < 2) return;

    let count = 0;
    let at = text.indexOf(needle);
    while (at !== -1 && count < REPETITION_MIN) {
      count += 1;
      at = text.indexOf(needle, at + needle.length);
    }
    if (count < REPETITION_MIN) return;

    out.push({
      signal: 'repetition:technical-document',
      delta: REPETITION_PENALTY,
      detail: `repeated ${count}+ times in ${profile.format}`,
    });
  }

  return { profile, structure, triggers, signalAt, score };
}
