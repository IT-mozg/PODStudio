/* Dependency Inversion: ShopsPage depends on this interface, never on
   a concrete data source. Two implementations exist: the in-memory mock
   below (still ShopDetailPage's default) and httpShopsRepository, backed by
   the real Flask/Etsy API — ShopsPage swapped to it without a single change
   to ShopsTable or any other component. */

import type { Shop } from "./types";

export interface ShopSearchResult {
  shops: Shop[];
  /** How many shops matched in total, which can be far more than `shops`
   *  carries: an Etsy name search reports tens of thousands of matches and
   *  returns the first 100. Shown in the results toolbar. */
  total: number;
}

export interface ShopsRepository {
  /** Sorting by the filter chips is the caller's job (see shopFilters.ts's
   *  sortShops) — Etsy has no server-side sort for shops at all, so the
   *  filter is deliberately not a parameter here: passing it would make a
   *  chip click look like it needs a network round trip. */
  search(query: string): Promise<ShopSearchResult>;
  toggleTracked(shopId: string): Promise<void>;
  getById(shopId: string): Promise<Shop | null>;
  /** Every tracked shop, independent of the current search — a bookmark
   *  outlives the query it was made under, so this can't be a filter over
   *  the last search's results. */
  getTracked(): Promise<Shop[]>;
}

/* Sales/revenue kept internally consistent (revenue ÷ sales lands
   around a plausible $18-28 POD price) — the shop detail view derives
   average price straight from these two fields, so an unrealistic
   ratio here (e.g. millions of "sales" against a six-figure revenue)
   would silently produce a nonsense $0.30 average price downstream. */
const MOCK_SHOPS: Shop[] = [
  { id: "ct", initials: "CT", name: "CatTeesShop", listings: 128, ageMonths: 34, niche: "funny cat", sales: "60 214", revenue: "$1.2M", rating: 4.83, reviews: "221.6k", growth: "+34%", tracked: true },
  { id: "vg", initials: "VG", name: "VintageGlowPrints", listings: 312, ageMonths: 61, niche: "retro / vintage", sales: "15 230", revenue: "$420k", rating: 4.87, reviews: "42.5k", growth: "+21%", tracked: false },
  { id: "kk", initials: "KK", name: "KrispKiwiStudio", listings: 94, ageMonths: 28, niche: "dog mom", sales: "7 640", revenue: "$190k", rating: 4.81, reviews: "22.4k", growth: "+18%", tracked: false },
  { id: "os", initials: "OS", name: "OldSchoolCulture", listings: 201, ageMonths: 45, niche: "minimalist", sales: "91 320", revenue: "$2.1M", rating: 4.87, reviews: "119.4k", growth: "+11%", tracked: false },
  { id: "mv", initials: "MV", name: "MugvoyageCo", listings: 76, ageMonths: 42, niche: "coffee / mugs", sales: "38 450", revenue: "$720k", rating: 4.79, reviews: "76.2k", growth: "+9%", tracked: false },
];

/** In-memory mock — mutates its own copy so the star toggle persists
 *  for the session, same as a real repository would against a server. */
class MockShopsRepository implements ShopsRepository {
  private shops = MOCK_SHOPS.map((s) => ({ ...s }));

  async search(query: string): Promise<ShopSearchResult> {
    // Always return a fresh array/objects: React bails out of re-rendering
    // when setState receives the exact same reference back, so a mock that
    // just returned `this.shops` would silently drop updates like a star
    // toggle when the query/filter didn't change.
    const needle = query.trim().toLowerCase();
    const matches = needle ? this.shops.filter((s) => s.name.toLowerCase().includes(needle)) : this.shops;
    return { shops: matches.map((s) => ({ ...s })), total: matches.length };
  }

  async toggleTracked(shopId: string): Promise<void> {
    const shop = this.shops.find((s) => s.id === shopId);
    if (shop) shop.tracked = !shop.tracked;
  }

  async getTracked(): Promise<Shop[]> {
    return this.shops.filter((s) => s.tracked).map((s) => ({ ...s }));
  }

  async getById(shopId: string): Promise<Shop | null> {
    const shop = this.shops.find((s) => s.id === shopId);
    return shop ? { ...shop } : null;
  }
}

export const mockShopsRepository: ShopsRepository = new MockShopsRepository();
