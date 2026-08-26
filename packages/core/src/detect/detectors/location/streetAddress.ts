/**
 * STREET_ADDRESS — multilingual heuristics, context-gated.
 *
 * SPEC.md: "multilingual heuristics across address conventions (Western,
 * East Asian reverse-order, Arabic), low base confidence, requires context
 * boost." Address grammar differs by convention, so the pattern is an
 * alternation of convention-specific shapes, each keyed by the street-type
 * lexicon of its languages rather than one English list:
 *
 *   • Western number-first:  221B Baker Street, 1600 Pennsylvania Avenue
 *   • Romance type-first:    12 rue de la Paix, Calle Mayor 8, Via Roma 3
 *   • Germanic name+number:  Hauptstraße 12a, Prinsengracht 263
 *   • Turkish:               Atatürk Caddesi No: 15, Çiçek Sok. 3
 *   • East Asian:            中山路25号, 銀座4丁目5番6号, 세종대로 110
 *   • Arabic:                شارع الملك فهد 12
 *
 * requiresContext caps everything at LOW until Stage 3; the convention
 * travels in metadata for fusion and for M4's surrogate generation.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const WESTERN_TYPES =
  '(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Square|Sq|Crescent|Close|Gardens)';
const ROMANCE_TYPES =
  '(?:rue|avenue|boulevard|impasse|allée|chemin|place|quai|calle|avenida|paseo|plaza|carrer|via|viale|piazza|corso|rua|travessa|praça)';
const GERMANIC_SUFFIX =
  '(?:straße|strasse|weg|gasse|platz|allee|ring|damm|ufer|straat|laan|plein|gracht|kade|singel|gade|vej|gatan|vägen|veien|gata)';
const TURKISH_TYPES = '(?:Caddesi|Cadde|Cad\\.|Sokak|Sokağı|Sok\\.|Bulvarı|Bulvar|Blv\\.|Mahallesi|Mah\\.)';

type Convention = 'western' | 'romance' | 'germanic' | 'turkish' | 'east-asian' | 'arabic';

const CLASSIFIERS: readonly (readonly [RegExp, Convention])[] = [
  [new RegExp(`^\\d{1,5}[A-Za-z]? [\\p{Lu}][\\p{L}.'-]*(?: [\\p{Lu}][\\p{L}.'-]*){0,3} ${WESTERN_TYPES}\\.?$`, 'u'), 'western'],
  [new RegExp(`^\\d{1,5},? ${ROMANCE_TYPES} [\\p{L}][\\p{L} .'-]{2,40}$`, 'iu'), 'romance'],
  [new RegExp(`^${ROMANCE_TYPES} [\\p{L}][\\p{L} .'-]{2,40},? \\d{1,5}$`, 'iu'), 'romance'],
  [new RegExp(`^[\\p{Lu}][\\p{L}]{2,30}${GERMANIC_SUFFIX} \\d{1,4}[a-z]?$`, 'u'), 'germanic'],
  [new RegExp(`^[\\p{Lu}][\\p{L}]{1,20}(?: [\\p{Lu}][\\p{L}]{1,20})? ${TURKISH_TYPES}(?: No:? ?\\d{1,4}(?:\\/\\d{1,3})?)?$`, 'u'), 'turkish'],
  [/^[一-鿿]{1,12}(?:路|街|大道)\d{1,4}号(?:楼|栋)?$/u, 'east-asian'],
  [/^[一-鿿぀-ヿ]{1,12}\d{1,3}丁目(?:\d{1,3}番地?)?(?:\d{1,3}号)?$/u, 'east-asian'],
  [/^[가-힯]{2,12}(?:로|길) ?\d{1,4}(?:-\d{1,3})?$/u, 'east-asian'],
  [/^شارع [؀-ۿ]{2,20}(?: [؀-ۿ]{2,20}){0,3}(?: \d{1,4})?$/u, 'arabic'],
];

function validateStreet(ctx: ValidationContext): ValidationResult {
  const value = ctx.match[0].trim();

  for (const [shape, convention] of CLASSIFIERS) {
    if (shape.test(value)) {
      return valid({
        metadata: { convention },
        validator: 'address-heuristic',
      });
    }
  }
  return invalid('no address convention matched');
}

registerDetector({
  id: 'street-address',
  entityType: 'STREET_ADDRESS',
  regions: [GLOBAL_REGION],
  // The harvest union of every convention shape; the validator classifies.
  pattern: new RegExp(
    [
      `\\d{1,5}[A-Za-z]? [\\p{Lu}][\\p{L}.'-]*(?: [\\p{Lu}][\\p{L}.'-]*){0,3} ${WESTERN_TYPES}\\.?(?![\\p{L}])`,
      `\\d{1,5},? ${ROMANCE_TYPES} [\\p{L}][\\p{L} .'-]{2,40}`,
      `${ROMANCE_TYPES} [\\p{L}][\\p{L} .'-]{2,40},? \\d{1,5}`,
      `[\\p{Lu}][\\p{L}]{2,30}${GERMANIC_SUFFIX} \\d{1,4}[a-z]?`,
      `[\\p{Lu}][\\p{L}]{1,20}(?: [\\p{Lu}][\\p{L}]{1,20})? ${TURKISH_TYPES}(?: No:? ?\\d{1,4}(?:\\/\\d{1,3})?)?`,
      `[\\u4e00-\\u9fff]{1,12}(?:路|街|大道)\\d{1,4}号(?:楼|栋)?`,
      `[\\u4e00-\\u9fff\\u3040-\\u30ff]{1,12}\\d{1,3}丁目(?:\\d{1,3}番地?)?(?:\\d{1,3}号)?`,
      `[\\uac00-\\ud7af]{2,12}(?:로|길) ?\\d{1,4}(?:-\\d{1,3})?`,
      `شارع [\\u0600-\\u06ff]{2,20}(?: [\\u0600-\\u06ff]{2,20}){0,3}(?: \\d{1,4})?`,
    ].join('|'),
    'gu',
  ),
  baseConfidence: CONFIDENCE.MEDIUM,
  requiresContext: true,
  description: 'Street addresses across six writing conventions; LOW until Stage 3 context.',
  validate: validateStreet,
});
