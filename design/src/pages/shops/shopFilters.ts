/* Single source of truth for the shop filter chips, same split as
   listingFilters.ts: the options themselves plus the client-side sort they
   imply. */

import { DesignsIcon, GridSquaresIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import type { FilterOption } from "../../shared/components/FilterChips";
import { parseCount } from "../../shared/money";
import type { Shop, ShopFilter } from "./types";

/** Only "Топ продавці" is answerable from Etsy's public API: a shop's
 *  lifetime transaction_sold_count is real, so sorting by it is real.
 *
 *  The other three are disabled rather than silently approximated:
 *  - "Швидко ростуть" needs sales *over time*, and Etsy exposes one
 *    all-time counter with no history at all (#81, needs daily snapshots);
 *  - "POD-тренд" needs a notion of what a POD shop even is — there is no
 *    category/niche field (#82);
 *  - "Схожі на мої" needs the user's own shop connected via OAuth, which
 *    this app does not do yet.
 *  Faking them with some other sort would look like a working filter while
 *  answering a different question. */
export const SHOP_FILTERS: FilterOption<ShopFilter>[] = [
  { id: "top", label: "Топ продавці", icon: StarIcon },
  { id: "growing", label: "Швидко ростуть", icon: TrendUpIcon, disabled: true,
    disabledHint: "Потрібна історія продажів — щоденні знімки (issue #81)" },
  { id: "podTrend", label: "POD-тренд", icon: DesignsIcon, disabled: true,
    disabledHint: "Потрібне визначення ніші магазину (issue #82)" },
  { id: "similar", label: "Схожі на мої", icon: GridSquaresIcon, disabled: true,
    disabledHint: "Потрібне підключення власного магазину через OAuth" },
];

/** Client-side because no repository has a server-side equivalent — Etsy has
 *  no sort parameter on shop search whatsoever, so a chip must not cost a
 *  network round trip.
 *
 *  `null` means no chip is active, which is the default: the repository
 *  already returns shops in name-relevance order (exact match, then prefix
 *  matches, then Etsy's fuzzy extras), and that must stay the resting state.
 *  Sorting by sales up front would bury the shop the user actually typed —
 *  searching "OldRetro" put the exact match last of six, behind a shop with
 *  1,312 sales whose name only fuzzily matched. */
export function sortShops(shops: Shop[], filter: ShopFilter | null): Shop[] {
  const sorted = [...shops];
  switch (filter) {
    case "top":
      return sorted.sort((a, b) => parseCount(b.sales) - parseCount(a.sales));
    // null, plus the three chips that are disabled (see SHOP_FILTERS): keep
    // the source's own order instead of inventing a ranking.
    default:
      return sorted;
  }
}
