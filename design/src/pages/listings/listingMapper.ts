/* Maps the raw Flask /api/listings JSON shape (container.py's
   listings_payload()) onto design/'s Listing type. Kept as a standalone
   pure function — see httpListingsRepository.ts, ListingsPage's default
   repository, for where it's used against the live backend. */

import { formatCount, formatRevenue } from "../../shared/money";
import { mulberry32, seedFromString } from "../../shared/prng";
import type { Listing } from "./types";

/** Shape actually returned by Flask's listings_payload() (container.py) —
 *  field names match the backend's snake_case JSON verbatim, not the
 *  frontend's camelCase Listing. Only the fields mapApiListing() reads are
 *  declared; the payload has more (thumb, etsy_url, prompt, ...) that this
 *  mapper doesn't need. */
export interface ApiListing {
  lid: string;
  title: string;
  shop_id: string;
  shop_name: string;
  views: number;
  sales: number | null;
  revenue: number | null;
  age_months: number;
  tags: string[];
  tracked: boolean;
}

// Same 5-pair palette shopDetail.ts/listingDetail.ts use for their
// generated mock listings — kept local since each of those files already
// keeps its own copy rather than sharing one (existing convention here).
const GRADIENTS: [string, string][] = [
  ["#ff9a5a", "#e0653f"],
  ["#7c6cff", "#5b4bdb"],
  ["#4ade80", "#22916a"],
  ["#f472b6", "#c2418e"],
  ["#5ad1e0", "#2f95a3"],
];

function thumbGradientFor(id: string): [string, string] {
  const rand = mulberry32(seedFromString(id));
  return GRADIENTS[Math.floor(rand() * GRADIENTS.length)];
}

/** sales/revenue arrive as `null` whenever the backend has no real number
 *  for them (currently: always — Etsy's API exposes neither per listing;
 *  estimating them is issue #57/#58). formatCount/formatRevenue in
 *  shared/money.ts render that as "—" rather than "0"/"$NaN", and the shop
 *  mapper needs the same treatment, which is why they live there. */
export function mapApiListing(raw: ApiListing): Listing {
  return {
    id: raw.lid,
    title: raw.title,
    shopId: raw.shop_id,
    shopName: raw.shop_name,
    views: raw.views.toLocaleString("uk-UA"),
    sales: formatCount(raw.sales),
    revenue: formatRevenue(raw.revenue),
    ageMonths: raw.age_months,
    tags: raw.tags,
    tracked: raw.tracked,
    thumbGradient: thumbGradientFor(raw.lid),
  };
}
