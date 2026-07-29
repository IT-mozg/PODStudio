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
  /** null when the shop has no reviews at all. Etsy sends review_average as
   *  0.0 in that case, and rendering "★ 0.00" would read as a one-star shop
   *  rather than a new one — the same "0 where there is no data" trap
   *  formatCount already avoids for the other fields. */
  rating: number | null;
  reviews: string;
  growth: string;
  /** Etsy's icon_url_fullxfull, "" when the shop has no icon. Consumers fall
   *  back to `initials`. */
  iconUrl: string;
  /** num_favorers — real, and a 0 here is a genuine zero, not missing data. */
  favorers: string;
  /** Public shop page. The backend always fills it (falling back to
   *  /shop/{name}), but consumers still guard: an empty href would link to
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
