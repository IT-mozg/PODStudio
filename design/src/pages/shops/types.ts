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

/** One month of a shop's estimated sales (#45).
 *
 *  `known: false` is not "zero sales" — it is "this method cannot see this
 *  month". Sales made before a shop's first review are invisible to the
 *  review-histogram estimate, so those months must render as unknown. On a
 *  real shop that distinction was worth two months of confirmed selling that
 *  would otherwise have shown as a flat zero. */
export interface MonthlySalesPoint {
  /** Already localised to a short Ukrainian month name by shopMapper. */
  label: string;
  sales: number;
  known: boolean;
}

/** A shop's sales history — an *estimate* derived from its review histogram,
 *  never measured data. Anything rendering it has to say so. */
export interface SalesHistory {
  months: MonthlySalesPoint[];
  /** Sales per review for this shop, the estimate's own resolution: nothing
   *  finer than this is representable. */
  ratio: number;
}

export type ShopFilter = "top" | "growing" | "podTrend" | "similar";
