/** Add `?lite` to the address for weaker computers: fewer plants, no bloom, no anti-aliasing buffer. */
export const LITE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lite');
