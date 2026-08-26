/**
 * COORDINATES — latitude/longitude in decimal degrees and DMS.
 *
 * This one HAS a real validator (unlike its two siblings): parsed values
 * must lie in [−90, 90] × [−180, 180]. DMS with its degree/minute/second
 * marks is unmistakable → HIGH. A bare decimal pair is weaker evidence even
 * in range — "3.141, 2.718" is a coordinate to no one — so decimal pairs
 * demand ≥3 fraction digits (GPS-typical precision) and earn MEDIUM, with
 * hemisphere suffixes lifting them to HIGH.
 *
 * (0, 0) — "null island" — is the classic placeholder and is rejected.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

const DECIMAL_PAIR =
  /^(-?\d{1,3}\.\d{3,8})°?\s*([NS])?[,;]\s*(-?\d{1,3}\.\d{3,8})°?\s*([EW])?$/;

// The seconds mark: detectors see NORMALIZED text, and NFKC decomposes
// U+2033 DOUBLE PRIME into TWO U+2032 PRIMEs — so ″ arrives here as ′′.
// Straight quotes pass normalization unchanged; curly ones become straight.
const SECONDS = String.raw`(?:′′|''|″|")`;
const DMS_ONE = String.raw`(\d{1,3})°\s?(\d{1,2})[′']\s?(\d{1,2}(?:\.\d+)?)${SECONDS}?\s?([NSEW])`;
const DMS_PAIR = new RegExp(`^${DMS_ONE}[,;]?\\s*${DMS_ONE}$`);

function validateCoordinates(ctx: ValidationContext): ValidationResult {
  const value = ctx.match[0].trim();

  const dms = DMS_PAIR.exec(value);
  if (dms !== null) {
    const first = dmsToDecimal(Number(dms[1]), Number(dms[2]), Number(dms[3]), dms[4]!);
    const second = dmsToDecimal(Number(dms[5]), Number(dms[6]), Number(dms[7]), dms[8]!);
    if (first === null || second === null) return invalid('DMS component out of range');
    const lat = dms[4] === 'N' || dms[4] === 'S' ? first : second;
    const lon = dms[4] === 'N' || dms[4] === 'S' ? second : first;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return invalid('coordinate out of range');
    return valid({
      confidence: CONFIDENCE.HIGH,
      metadata: { format: 'dms', lat: round6(lat), lon: round6(lon) },
      validator: 'coordinate-range',
    });
  }

  const dec = DECIMAL_PAIR.exec(value);
  if (dec !== null) {
    let lat = Number(dec[1]);
    let lon = Number(dec[3]);
    if (dec[2] === 'S') lat = -lat;
    if (dec[4] === 'W') lon = -lon;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return invalid('coordinate out of range');
    if (lat === 0 && lon === 0) return invalid('null island placeholder');
    const hasHemispheres = dec[2] !== undefined && dec[4] !== undefined;
    return valid({
      confidence: hasHemispheres ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      metadata: { format: 'decimal', lat: round6(lat), lon: round6(lon) },
      validator: 'coordinate-range',
    });
  }

  return invalid('not a coordinate pair');
}

function dmsToDecimal(deg: number, min: number, sec: number, hemi: string): number | null {
  if (min >= 60 || sec >= 60) return null;
  const value = deg + min / 60 + sec / 3600;
  return hemi === 'S' || hemi === 'W' ? -value : value;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

registerDetector({
  id: 'coordinates',
  entityType: 'COORDINATES',
  regions: [GLOBAL_REGION],
  // Hemisphere letters are grouped WITH their leading space so that an
  // absent hemisphere cannot leave a trailing space inside the span.
  pattern:
    /(?<![\d.])(?:-?\d{1,3}\.\d{3,8}°?(?: ?[NS])?[,;]\s*-?\d{1,3}\.\d{3,8}°?(?: ?[EW])?|\d{1,3}° ?\d{1,2}[′'] ?\d{1,2}(?:\.\d+)?(?:′′|''|″|")? ?[NSEW][,;]? ?\d{1,3}° ?\d{1,2}[′'] ?\d{1,2}(?:\.\d+)?(?:′′|''|″|")? ?[NSEW])(?![\d.])/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  description: 'Lat/long pairs in decimal (≥3 fraction digits) and DMS, range-validated.',
  validate: validateCoordinates,
});
