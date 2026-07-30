export interface Listing {
  id: string;
  title: string;
  /** A real Etsy shop_id, which ShopDetailPage resolves against the same
   *  backend — so onSelectShop always links somewhere. */
  shopId: string;
  shopName: string;
  views: string;
  sales: string;
  revenue: string;
  /** `null` when Etsy gave no creation date — unlike 0, which means the
   *  listing genuinely is under a month old. */
  ageMonths: number | null;
  tags: string[];
  tracked: boolean;
  /** Empty string when the backend had no image URL — thumbGradient renders
   *  instead. */
  thumbUrl: string;
  thumbGradient: [string, string];
}

export type ListingFilter = "top" | "new" | "trending" | "outliers";

/* ---------------- detail page ----------------
   Everything below is rendered by ListingDetailView. It used to be
   synthesized by a seeded PRNG (listingDetail.ts, now deleted); the fields
   Etsy really exposes are now fetched, and the ones it doesn't are typed
   nullable so "no data" is representable instead of being faked. Each such
   field names the issue that will fill it in. */

export interface ListingAttribute {
  label: string;
  /** `null` renders as "—". Etsy returns [] for materials/style even on
   *  complete listings, and a missing attribute must never be filled in with
   *  a plausible default. */
  value: string | null;
}

/** The tag itself is real; every metric beside it needs the search-volume
 *  engine (#56, via #54/#55) and is `null` until then. */
export interface ListingTag {
  tag: string;
  volume: number | null;
  competition: number | null;
  kd: number | null;
  /** 14-point mini trend, newest last. */
  sparkline: number[] | null;
}

/** "unknown" is not a fourth grade — the check could not run. It must never
 *  collapse into "ok", which reads as "checked and fine". */
export type SeoCheckStatus = "ok" | "warn" | "bad" | "unknown";

/** One line of the SEO checklist, built by seoChecks.ts. */
export interface SeoCheckItem {
  status: SeoCheckStatus;
  title: string;
  detail: string;
  /** One plain sentence on what to aim for, shown behind the row's "i". Not
   *  the thresholds — those tell a seller nothing they can act on. */
  why: string;
  /** Only on "unknown": the issue that will make the check computable. */
  todoIssue?: number;
}

export interface ScoreSub {
  score: number;
  note: string;
}

/** Computed by listingScore.ts off seoSignals — never fetched, never seeded. */
export interface ScoreBreakdown {
  overall: number;
  title: ScoreSub;
  tags: ScoreSub;
  photos: ScoreSub;
  description: ScoreSub;
}

/** A slice of the real description. `flag` says where the keyword came from,
 *  not how bad it is — severity belongs to the checklist. */
export interface DescriptionSegment {
  text: string;
  flag?: "tag" | "title";
}

/** Flask's container.listing_detail_payload(), as opposed to the lean
 *  listings_payload() behind the search grid. */
export interface ListingDetail extends Listing {
  /** Empty string when the listing has none. */
  description: string;
  /** Pre-formatted in the listing's own currency (money.ts formatPrice);
   *  `null` when the backend has no price. */
  price: string | null;
  /** Every photo Etsy has, in its own rank order (up to 10). */
  photos: string[];
  attributes: ListingAttribute[];
  /** Canonical listing URL as Etsy reports it, slug included. */
  etsyUrl: string;
  /** Formatted. Unlike sales/revenue this is real — the only public
   *  per-listing demand signal Etsy exposes — so `0` is a genuine zero. */
  favorites: string;
  /** Formatted with its leading "≈" ("≈ 2,07%"); `null` without a price or a
   *  USD conversion.
   *
   *  **Not an Etsy figure** — Etsy publishes conversion to a shop's owner
   *  only. This is the price-bucket model in models/conversion_rate.py, and
   *  that "≈" is the only thing separating it on screen from the real numbers
   *  beside it. Keep it anywhere this value gets rendered. */
  convRate: string | null;
  /** Lifetime views averaged per month, not a current rate — Etsy exposes
   *  only the lifetime total (#87). */
  viewsPerMonth: string;
}
