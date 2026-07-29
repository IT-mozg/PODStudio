export interface Listing {
  id: string;
  title: string;
  /** Id of the shop this listing belongs to. Against the live backend this
   *  is a real Etsy shop_id, which ShopDetailPage resolves against the same
   *  backend (#8) — so wherever a caller wires onSelectShop, it links. */
  shopId: string;
  shopName: string;
  views: string;
  sales: string;
  revenue: string;
  /** `null` when Etsy gave no creation date — not the same as 0, which
   *  means the listing genuinely is under a month old. */
  ageMonths: number | null;
  tags: string[];
  tracked: boolean;
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
  /** `null` renders as "—". Etsy frequently returns [] for materials/style
   *  even on complete listings, and a missing attribute must never be
   *  filled in with a plausible-looking default. */
  value: string | null;
}

/** One row of the tags audit table. The tag itself is real (Etsy gives up to
 *  13 per listing); every metric beside it needs the search-volume engine —
 *  Epic #56, specifically #54/#55 — and is `null` until then. */
export interface ListingTag {
  tag: string;
  volume: number | null;
  competition: number | null;
  kd: number | null;
  /** 14-point mini trend, newest last. */
  sparkline: number[] | null;
}

/** "unknown" is not a fourth grade — it means the check could not be run at
 *  all because its data source doesn't exist yet. It must never collapse
 *  into "ok", which would read as "checked and fine". */
export type SeoCheckStatus = "ok" | "warn" | "bad" | "unknown";

/** One line of the SEO checklist, built by seoChecks.ts from the real
 *  measurements in seoSignals.ts. */
export interface SeoCheckItem {
  status: SeoCheckStatus;
  title: string;
  detail: string;
  /** One plain sentence on why this matters and what to aim for, shown
   *  behind the row's "i". Deliberately not the numeric thresholds: those
   *  are this project's judgement call, and reciting them ("менше 60 — bad")
   *  told the seller nothing they could act on. */
  why: string;
  /** Set only on "unknown" checks: the issue that will make it computable. */
  todoIssue?: number;
}

export interface ScoreSub {
  score: number;
  note: string;
}

/** Populated by #84. */
export interface ScoreBreakdown {
  overall: number;
  title: ScoreSub;
  tags: ScoreSub;
  photos: ScoreSub;
  description: ScoreSub;
}

/** A slice of the real description text, cut along the keyword occurrences
 *  seoSignals.ts found. `flag` says where the keyword came from — the
 *  listing's own tags or a significant word of its title — not how bad it
 *  is; severity lives in the checklist, which counts the repetitions. */
export interface DescriptionSegment {
  text: string;
  flag?: "tag" | "title";
}

/** A listing plus everything only the detail route returns — Flask's
 *  container.listing_detail_payload(), as opposed to the lean
 *  listings_payload() behind the search grid. */
export interface ListingDetail extends Listing {
  /** Real Etsy description text. Empty string when the listing has none. */
  description: string;
  /** Already formatted with the listing's own currency (see
   *  shared/money.ts's formatPrice) — `null` when the backend has no price. */
  price: string | null;
  /** Every photo Etsy has, in its own rank order (up to 10). */
  photos: string[];
  attributes: ListingAttribute[];
  /** Canonical listing URL as Etsy reports it, slug included. */
  etsyUrl: string;
  /** How many people favourited the listing — already formatted. Unlike
   *  sales/revenue this one is real: it's the only public per-listing demand
   *  signal Etsy exposes. `0` here is a genuine zero, not missing data. */
  favorites: string;
  /** Estimated conversion rate, already formatted with its leading "≈"
   *  ("≈ 2,07%") — `null` when the listing has no price or its currency
   *  couldn't be converted to USD.
   *
   *  **Not an Etsy figure.** Etsy publishes no conversion rate to anyone but
   *  a shop's own owner; this is the reverse-engineered price-bucket model in
   *  models/conversion_rate.py. That "≈" is the only thing distinguishing it
   *  on screen from the real Etsy numbers beside it, so keep it in any new
   *  place this value gets rendered. */
  convRate: string | null;
  /** Lifetime views averaged per month, formatted. Not a current rate —
   *  Etsy exposes only a lifetime total (#87). */
  viewsPerMonth: string;
}
