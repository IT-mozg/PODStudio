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
 *  product-defined semantics for each chip. "top" sorts by the #58 sales
 *  estimate (views weighted by price, not a measured count); views only
 *  break ties. A listing whose currency has no ECB rate - VND and MAD are
 *  the two Etsy sells in that ECB doesn't quote - estimates as 0 and sorts
 *  last no matter its views. Known and accepted: ~1 listing in 600. */
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
