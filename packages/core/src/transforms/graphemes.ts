/**
 * Shared grapheme-cluster segmenter. Grapheme segmentation (UAX #29) is
 * locale-independent, so one instance serves the whole library.
 */
export const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
