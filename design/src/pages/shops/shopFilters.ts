/* Single source of truth for the shop filter chips, same split as
   listingFilters.ts: the options themselves plus the client-side sort they
   imply. */

import { DesignsIcon, GridSquaresIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import type { FilterOption } from "../../shared/components/FilterChips";
import { parseCount } from "../../shared/money";
import type { Shop, ShopFilter } from "./types";

/** Only "Топ продавці" is answerable: transaction_sold_count is real.
 *
 *  The other three are disabled rather than approximated — "Швидко ростуть"
 *  needs history Etsy doesn't keep (#81), "POD-тренд" needs a niche field
 *  that doesn't exist (#82), "Схожі на мої" needs OAuth. Any stand-in sort
 *  would look like a working filter answering a different question. */
export const SHOP_FILTERS: FilterOption<ShopFilter>[] = [
  { id: "top", label: "Топ продавці", icon: StarIcon },
  { id: "growing", label: "Швидко ростуть", icon: TrendUpIcon, disabled: true,
    disabledHint: "Потрібна історія продажів — щоденні знімки (issue #81)" },
  { id: "podTrend", label: "POD-тренд", icon: DesignsIcon, disabled: true,
    disabledHint: "Потрібне визначення ніші магазину (issue #82)" },
  { id: "similar", label: "Схожі на мої", icon: GridSquaresIcon, disabled: true,
    disabledHint: "Потрібне підключення власного магазину через OAuth" },
];

/** Client-side: Etsy has no sort parameter on shop search at all, and a chip
 *  must not cost a round trip.
 *
 *  `null` (no chip) is the default and the resting state — the repository
 *  already returns name-relevance order. Sorting by sales up front buried the
 *  exact match: "OldRetro" came last of six, behind a fuzzy match with 1,312
 *  sales. */
export function sortShops(shops: Shop[], filter: ShopFilter | null): Shop[] {
  const sorted = [...shops];
  switch (filter) {
    case "top":
      return sorted.sort((a, b) => parseCount(b.sales) - parseCount(a.sales));
    // null plus the three disabled chips: keep the source's own order.
    default:
      return sorted;
  }
}
