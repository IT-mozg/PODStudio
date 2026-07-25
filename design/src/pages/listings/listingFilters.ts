/* Single source of truth for the listing filter chips — both the
   Лістинги page and any embedded listings table (e.g. inside a shop's
   detail page) show the exact same four options. */

import { AlertCircleIcon, DesignsIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import type { FilterOption } from "../../shared/components/FilterChips";
import type { ListingFilter } from "./types";

export const LISTING_FILTERS: FilterOption<ListingFilter>[] = [
  { id: "top", label: "Топ продажів", icon: StarIcon },
  { id: "new", label: "Нові", icon: DesignsIcon },
  { id: "trending", label: "В тренді", icon: TrendUpIcon },
  { id: "outliers", label: "Викиди", icon: AlertCircleIcon },
];
