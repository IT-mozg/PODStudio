/** Deterministic pseudo-random generator seeded from a string. Used
 *  wherever a mock needs to look different per-entity (per keyword,
 *  per shop) but stay stable across re-renders and reloads instead of
 *  reshuffling every time — extracted here since keywordsRepository
 *  and listingMapper both need the same seeding + RNG.
 *
 *  Note the narrowed remit: this used to seed whole detail pages
 *  (listingDetail.ts, shopDetail.ts, both deleted in #78/#8) with invented
 *  metrics. What's left is presentational only — a keyword's mock row and a
 *  listing thumbnail's gradient. Don't grow it back into numbers a user
 *  could mistake for measurements. */
export function seedFromString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
