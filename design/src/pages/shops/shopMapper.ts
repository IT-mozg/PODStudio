/* Maps the raw Flask /api/shops JSON shape (container.py's shops_payload())
   onto design/'s Shop type. Same split as listingMapper.ts: a standalone
   pure function, used by httpShopsRepository against the live backend. */

import { formatCount, formatRevenue } from "../../shared/money";
import type { SalesHistory, Shop } from "./types";

/** Verbatim from container.shops_payload() — snake_case, not camelCase. */
export interface ApiShop {
  shop_id: string;
  name: string;
  listing_count: number;
  // null when Etsy gave no creation date — distinct from 0.
  age_months: number | null;
  /** Etsy's public transaction_sold_count (lifetime line items). */
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

/** Verbatim from container.sales_history_payload(). */
export interface ApiSalesHistory {
  shop_id: string;
  /** Which estimate produced this — "reviews" today, snapshots under #46. */
  method: string;
  ratio: number;
  months: { month: string; sales: number; known: boolean }[];
}

/* Intl.DateTimeFormat("uk-UA", { month: "short" }) yields "серп." — the dot
   and the extra letter make a 12-column axis noisy, so the labels are spelled
   out. Index 0 is January, matching the "MM" half of the payload's "YYYY-MM". */
const MONTH_LABELS_UK = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер",
                         "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];

export function mapApiSalesHistory(raw: ApiSalesHistory): SalesHistory {
  return {
    ratio: raw.ratio,
    months: raw.months.map((m) => ({
      // Falls back to the raw "YYYY-MM" rather than rendering "undefined" if
      // the backend ever sends a month outside 01-12.
      label: MONTH_LABELS_UK[Number(m.month.slice(5, 7)) - 1] ?? m.month,
      sales: m.sales,
      known: m.known,
    })),
  };
}

/** Etsy shop names are camel-cased far more often than spaced, so the
 *  capitals carry the initials. A lowercase name falls back to its first two
 *  letters rather than rendering one. */
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
    // "—", not "", so the Pill keeps its shape while the niche is unknown.
    niche: raw.niche ?? "—",
    sales: formatCount(raw.sales),
    revenue: formatRevenue(raw.revenue),
    // Etsy sends review_average: 0.0 for an unreviewed shop, which is not
    // "rated 0.00" — null so consumers render "—" instead.
    rating: raw.review_count > 0 ? raw.review_average : null,
    reviews: formatCount(raw.review_count),
    growth: raw.growth === null ? "—" : `${raw.growth > 0 ? "+" : ""}${raw.growth}%`,
    iconUrl: raw.icon_url,
    favorers: formatCount(raw.num_favorers),
    etsyUrl: raw.etsy_url,
    tracked: raw.tracked,
  };
}
