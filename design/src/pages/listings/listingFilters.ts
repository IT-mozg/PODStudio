/* Single source of truth for the listing filter chips — both the
   Лістинги page and any embedded listings table (e.g. inside a shop's
   detail page) show the exact same four options. */

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

/** Sorting for the chips above. Deliberately client-side: neither
 *  repository has a server-side equivalent (Flask exposes no sort param on
 *  /api/listings), so this lives here rather than inside an implementation
 *  — that also keeps a filter change from costing a network round trip.
 *
 *  These are approximations over whatever real fields exist, not the
 *  product-defined semantics for each chip. "top" now sorts by the #58
 *  sales estimate — which is views weighted by the listing's price bucket,
 *  not a measured sales count — and keeps the views tiebreaker for the rows
 *  where that estimate is 0 because the price or the FX rate was missing. */
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
      return sorted.sort((a, b) => a.ageMonths - b.ageMonths);
    case "trending":
      return sorted.sort((a, b) => parseCount(b.views) - parseCount(a.views));
    case "outliers":
      return sorted.sort((a, b) => parseCount(a.views) - parseCount(b.views));
  }
}
