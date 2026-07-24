/* Dependency Inversion: ShopsPage depends on this interface, never on
   a concrete data source. Today it's backed by an in-memory mock;
   swapping to the real Flask API later means writing a second class
   that implements ShopsRepository and passing it into ShopsPage —
   no page or component code changes. */

import type { Shop, ShopFilter } from "./types";

export interface ShopsRepository {
  search(query: string, filter: ShopFilter): Promise<Shop[]>;
  toggleTracked(shopId: string): Promise<void>;
}

const MOCK_SHOPS: Shop[] = [
  { id: "ct", initials: "CT", name: "CatTeesShop", listings: 128, ageMonths: 34, niche: "funny cat", sales: "3 803 985", revenue: "$1.2M", rating: 4.83, reviews: "221.6k", growth: "+34%", tracked: true },
  { id: "vg", initials: "VG", name: "VintageGlowPrints", listings: 312, ageMonths: 61, niche: "retro / vintage", sales: "167 370", revenue: "$420k", rating: 4.87, reviews: "42.5k", growth: "+21%", tracked: false },
  { id: "kk", initials: "KK", name: "KrispKiwiStudio", listings: 94, ageMonths: 28, niche: "dog mom", sales: "76 109", revenue: "$190k", rating: 4.81, reviews: "22.4k", growth: "+18%", tracked: false },
  { id: "os", initials: "OS", name: "OldSchoolCulture", listings: 201, ageMonths: 45, niche: "minimalist", sales: "820 896", revenue: "$2.1M", rating: 4.87, reviews: "119.4k", growth: "+11%", tracked: false },
];

/** In-memory mock — mutates its own copy so the star toggle persists
 *  for the session, same as a real repository would against a server. */
class MockShopsRepository implements ShopsRepository {
  private shops = MOCK_SHOPS.map((s) => ({ ...s }));

  async search(query: string, _filter: ShopFilter): Promise<Shop[]> {
    // Always return a fresh array/objects: React bails out of re-rendering
    // when setState receives the exact same reference back, so a mock that
    // just returned `this.shops` would silently drop updates like a star
    // toggle when the query/filter didn't change.
    const needle = query.trim().toLowerCase();
    const matches = needle ? this.shops.filter((s) => s.name.toLowerCase().includes(needle)) : this.shops;
    return matches.map((s) => ({ ...s }));
  }

  async toggleTracked(shopId: string): Promise<void> {
    const shop = this.shops.find((s) => s.id === shopId);
    if (shop) shop.tracked = !shop.tracked;
  }
}

export const mockShopsRepository: ShopsRepository = new MockShopsRepository();
