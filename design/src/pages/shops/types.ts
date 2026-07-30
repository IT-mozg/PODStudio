export interface Shop {
  id: string;
  initials: string;
  name: string;
  listings: number;
  /** `null` when Etsy gave no creation date. */
  ageMonths: number | null;
  niche: string;
  sales: string;
  revenue: string;
  /** null when the shop has no reviews. Etsy sends 0.0 there, and "★ 0.00"
   *  would read as a badly rated shop rather than a new one. */
  rating: number | null;
  reviews: string;
  growth: string;
  /** "" when the shop has no icon — consumers fall back to `initials`. */
  iconUrl: string;
  /** num_favorers — real, so 0 is a genuine zero, not missing data. */
  favorers: string;
  /** The backend always fills it, but guard anyway — an empty href links to
   *  the current page. */
  etsyUrl: string;
  tracked: boolean;
}

/** One review card. Etsy exposes these through /shops/{id}/reviews, which
 *  isn't wired up yet — until #92 the only values of this shape are the
 *  hand-written ones in previewData.ts. */
export interface ShopReview {
  id: string;
  rating: number;
  date: string;
  text: string;
  listingRef: string;
}

export type ShopFilter = "top" | "growing" | "podTrend" | "similar";
