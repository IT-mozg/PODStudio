/* Dependency Inversion: the shops pages depend on this interface, never on
   a concrete data source. Two implementations exist: the in-memory mock
   below and httpShopsRepository, backed by the real Flask/Etsy API — both
   ShopsPage and ShopDetailPage swapped to it without a single change to
   ShopsTable, ShopDetailView or any other component.

   Nothing injects the mock any more (#8 moved ShopDetailPage, the last
   holdout, onto the HTTP one). It stays because it is the seam #31's first
   repository-DI test injects, and because a mock that has rotted out of
   sync with the interface is worse than no mock — the compiler keeps it
   honest as long as it's here. Same arrangement as mockListingsRepository. */

import type { SalesHistory, Shop } from "./types";

export interface ShopSearchResult {
  shops: Shop[];
  /** Total matches, which far exceeds `shops` — Etsy reports tens of
   *  thousands and returns the first 100. */
  total: number;
}

export interface ShopsRepository {
  /** Sorting is the caller's job (shopFilters.ts). Etsy has no server-side
   *  sort, so the filter is not a parameter — passing it would make a chip
   *  click look like it needs a round trip. */
  search(query: string): Promise<ShopSearchResult>;
  toggleTracked(shopId: string): Promise<void>;
  getById(shopId: string): Promise<Shop | null>;
  /** A bookmark outlives the query it was made under, so this can't be a
   *  filter over the last search's results. */
  getTracked(): Promise<Shop[]>;
  /** Estimated monthly sales, or null when the shop has no reviews to
   *  estimate from. Separate from getById because it is separately
   *  expensive — up to 14 Etsy requests — so the detail page can render
   *  without waiting for it. */
  getSalesHistory(shopId: string): Promise<SalesHistory | null>;
}

/* iconUrl is "" on every row on purpose: the mock should exercise the
   initials fallback, which is what a shop with no Etsy icon renders. */
const MOCK_SHOPS: Shop[] = [
  { id: "ct", initials: "CT", name: "CatTeesShop", listings: 128, ageMonths: 34, niche: "funny cat", sales: "60 214", revenue: "$1.2M", rating: 4.83, reviews: "221.6k", growth: "+34%", iconUrl: "", favorers: "8 412", etsyUrl: "https://www.etsy.com/shop/CatTeesShop", tracked: true },
  { id: "vg", initials: "VG", name: "VintageGlowPrints", listings: 312, ageMonths: 61, niche: "retro / vintage", sales: "15 230", revenue: "$420k", rating: 4.87, reviews: "42.5k", growth: "+21%", iconUrl: "", favorers: "3 105", etsyUrl: "https://www.etsy.com/shop/VintageGlowPrints", tracked: false },
  { id: "kk", initials: "KK", name: "KrispKiwiStudio", listings: 94, ageMonths: 28, niche: "dog mom", sales: "7 640", revenue: "$190k", rating: 4.81, reviews: "22.4k", growth: "+18%", iconUrl: "", favorers: "1 870", etsyUrl: "https://www.etsy.com/shop/KrispKiwiStudio", tracked: false },
  { id: "os", initials: "OS", name: "OldSchoolCulture", listings: 201, ageMonths: 45, niche: "minimalist", sales: "91 320", revenue: "$2.1M", rating: 4.87, reviews: "119.4k", growth: "+11%", iconUrl: "", favorers: "12 940", etsyUrl: "https://www.etsy.com/shop/OldSchoolCulture", tracked: false },
  { id: "mv", initials: "MV", name: "MugvoyageCo", listings: 76, ageMonths: 42, niche: "coffee / mugs", sales: "38 450", revenue: "$720k", rating: 4.79, reviews: "76.2k", growth: "+9%", iconUrl: "", favorers: "5 233", etsyUrl: "https://www.etsy.com/shop/MugvoyageCo", tracked: false },
];

/** Mutates its own copy, so a star toggle persists for the session. */
class MockShopsRepository implements ShopsRepository {
  private shops = MOCK_SHOPS.map((s) => ({ ...s }));

  async search(query: string): Promise<ShopSearchResult> {
    // Fresh copies: React bails out on an identical reference, silently
    // dropping a star toggle when query and filter didn't change.
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

  /* Null, not invented months: the mock's job is to exercise the seam, and a
     fabricated sales curve here is exactly the kind of number that later gets
     mistaken for a measurement. */
  async getSalesHistory(): Promise<SalesHistory | null> {
    return null;
  }
}

export const mockShopsRepository: ShopsRepository = new MockShopsRepository();
