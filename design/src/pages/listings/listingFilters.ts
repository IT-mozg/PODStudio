/* The listing filter chips, shared by the Лістинги page and any embedded
   listings table. */

import { AlertCircleIcon, DesignsIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import type { FilterOption } from "../../shared/components/FilterChips";
import { parseCount } from "../../shared/money";
import type { Listing, ListingFilter } from "./types";

export const LISTING_FILTERS: FilterOption<ListingFilter>[] = [
  { id: "top", label: "Топ продажів", icon: StarIcon },
  { id: "new", label: "Нові", icon: DesignsIcon },
  { id: "trending", label: "В тренді", icon: TrendUpIcon },
  { id: "outliers", label: "Викиди", icon: AlertCircleIcon },
];

/** Client-side because Flask exposes no sort param on /api/listings, and a
 *  chip click must not cost a round trip.
 *
 *  Approximations over the real fields, not the product-defined semantics.
 *  "top" sorts by the #58 sales estimate (views weighted by price), views
 *  only breaking ties — so a currency the ECB doesn't quote (VND, MAD)
 *  estimates as 0 and sorts last. Accepted: ~1 listing in 600. */
export function sortListings(listings: Listing[], filter: ListingFilter): Listing[] {
  const sorted = [...listings];
  switch (filter) {
    case "top":
      return sorted.sort(
        (a, b) =>
          parseCount(b.sales) - parseCount(a.sales) ||
          parseCount(b.views) - parseCount(a.views),
      );
    case "new":
      // Unknown age sorts last — a null coerced to 0 would read as newest.
      return sorted.sort(
        (a, b) => (a.ageMonths ?? Infinity) - (b.ageMonths ?? Infinity),
      );
    case "trending":
      return sorted.sort((a, b) => parseCount(b.views) - parseCount(a.views));
    case "outliers":
      return sorted.sort((a, b) => parseCount(a.views) - parseCount(b.views));
  }
}
