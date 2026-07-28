/* Maps the raw Flask /api/shops JSON shape (container.py's shops_payload())
   onto design/'s Shop type. Same split as listingMapper.ts: a standalone
   pure function, used by httpShopsRepository against the live backend. */

import { formatCount, formatRevenue } from "../../shared/money";
import type { Shop } from "./types";

/** Shape actually returned by Flask's shops_payload() (container.py) —
 *  snake_case, verbatim from the backend, not the frontend's camelCase
 *  Shop. */
export interface ApiShop {
  shop_id: string;
  name: string;
  listing_count: number;
  age_months: number;
  /** Real: Etsy's public transaction_sold_count (lifetime line items). */
  sales: number;
  review_average: number;
  review_count: number;
  num_favorers: number;
  icon_url: string;
  etsy_url: string;
  /** Always null today — Etsy exposes none of these; see #80/#81/#82. */
  revenue: number | null;
  growth: number | null;
  niche: string | null;
  tracked: boolean;
}

/** Two-letter avatar label. Etsy shop names are camel-cased far more often
 *  than they are spaced ("CatTeesShop", "OldRetroTees"), so the capitals
 *  carry the initials; a lowercase name ("cathynichols") falls back to its
 *  first two letters rather than rendering a single letter. */
export function initialsFor(name: string): string {
  const capitals = name.replace(/[^A-Za-zА-Яа-яІЇЄҐіїєґ]/g, "").match(/[A-ZА-ЯІЇЄҐ]/g);
  if (capitals && capitals.length >= 2) return capitals.slice(0, 2).join("");
  const letters = name.replace(/[^A-Za-zА-Яа-яІЇЄҐіїєґ0-9]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
}

export function mapApiShop(raw: ApiShop): Shop {
  return {
    id: raw.shop_id,
    initials: initialsFor(raw.name),
    name: raw.name,
    listings: raw.listing_count,
    ageMonths: raw.age_months,
    // "—" and not "" so the Pill in ShopsTable keeps its shape while the
    // niche is unknown (#82).
    niche: raw.niche ?? "—",
    sales: formatCount(raw.sales),
    revenue: formatRevenue(raw.revenue),
    // Etsy sends review_average: 0.0 for a shop nobody has reviewed yet,
    // which is not the same statement as "rated 0.00". Null here so every
    // consumer renders "—" instead of libelling a new shop.
    rating: raw.review_count > 0 ? raw.review_average : null,
    reviews: formatCount(raw.review_count),
    growth: raw.growth === null ? "—" : `${raw.growth > 0 ? "+" : ""}${raw.growth}%`,
    iconUrl: raw.icon_url,
    favorers: formatCount(raw.num_favorers),
    etsyUrl: raw.etsy_url,
    tracked: raw.tracked,
  };
}
