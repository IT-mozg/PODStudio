/** Deterministic RNG seeded from a string, so a mock looks different
 *  per-entity but stays stable across re-renders instead of reshuffling.
 *
 *  Presentational only — a keyword's mock row and a thumbnail gradient. It
 *  used to seed whole detail pages with invented metrics (listingDetail.ts,
 *  shopDetail.ts, deleted in #78/#8). Don't grow it back into numbers a user
 *  could read as measurements. */
export function seedFromString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

/** mulberry32, unmodified — the bit constants are the published algorithm,
 *  not tunables. */
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
