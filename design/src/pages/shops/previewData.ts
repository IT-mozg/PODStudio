/* Illustrative data for the shop-detail blocks that have no backend yet.
 *
 * READ THIS BEFORE USING ANY OF IT.
 *
 * These are NOT fallbacks and NOT sample values to render when a fetch comes
 * back empty. They exist for exactly one purpose: to show, inside an explicit
 * "Приклад — не реальні дані" frame, what each block is meant to look like
 * once its ticket lands — so the intended design isn't lost while the feature
 * waits. #8 deleted shopDetail.ts's PRNG precisely because invented numbers
 * were indistinguishable from measured ones; the difference here is the frame
 * (NoDataNotice's `preview` slot dims them, marks them, and makes them inert)
 * and the fact that these are hand-written constants rather than something
 * generated per shop.
 *
 * Rules if you touch this file:
 *   - only ever pass these through NoDataNotice's `preview` prop;
 *   - never merge them into a real Shop;
 *   - ids stay "preview-*" and shopName stays "ExampleShop" — a preview
 *     carrying a plausible Etsy id can reach a live route (commit 0eadad6),
 *     and one carrying the real shop's name reads as that shop's data even
 *     dimmed;
 *   - when a ticket below is closed, delete its constant along with the
 *     preview — a preview of a feature that already works is just a bug.
 */

import type { BarDatum } from "../../shared/components/BarBreakdown";
import type { RatingBreakdownDatum } from "../../shared/components/RatingBars";
import type { TrendPoint } from "../../shared/components/TrendChart";
import type { Listing } from "../listings/types";
import type { ShopReview } from "./types";

/** #49 — the 12-month sales chart. Shaped with a visible Q4 hump so the
 *  chart's point (seasonality of a POD shop) is legible at a glance.
 *  Labels must stay unique: BarTrendChart keys its bars on `label`. */
export const PREVIEW_SALES_TREND: TrendPoint[] = [
  { label: "Сер", value: 410 },
  { label: "Вер", value: 465 },
  { label: "Жов", value: 640 },
  { label: "Лис", value: 1180 },
  { label: "Гру", value: 1520 },
  { label: "Січ", value: 720 },
  { label: "Лют", value: 560 },
  { label: "Бер", value: 505 },
  { label: "Кві", value: 540 },
  { label: "Тра", value: 610 },
  { label: "Чер", value: 585 },
  { label: "Лип", value: 630 },
];

/** #91 — the min/avg/max row above the price histogram. Strings, because
 *  that block renders them verbatim. */
export const PREVIEW_PRICE_STATS = {
  min: "$12.00",
  avg: "$24.50",
  max: "$48.00",
};

/** #91 — the price histogram itself. Same six buckets the block was
 *  designed around, peaking where PREVIEW_PRICE_STATS.avg sits. */
export const PREVIEW_PRICE_BREAKDOWN: BarDatum[] = [
  { label: "$2-10", value: 40 },
  { label: "$10-17", value: 180 },
  { label: "$17-25", value: 420 },
  { label: "$25-32", value: 310 },
  { label: "$32-40", value: 120 },
  { label: "$40-55", value: 45 },
];

/** #92 — the 5★…1★ histogram. Percentages, summing to 100. */
export const PREVIEW_RATING_BREAKDOWN: RatingBreakdownDatum[] = [
  { stars: 5, pct: 87 },
  { stars: 4, pct: 8 },
  { stars: 3, pct: 3 },
  { stars: 2, pct: 1 },
  { stars: 1, pct: 1 },
];

/** #92 — review cards. Two, deliberately: enough to show the card layout
 *  and the two-column grid, few enough that nobody mistakes it for a loaded
 *  list. English text, because that is what Etsy reviews actually are. */
export const PREVIEW_REVIEWS: ShopReview[] = [
  {
    id: "preview-rev-1",
    rating: 5,
    date: "12 лип. 2026",
    text: "Print quality is great and it shipped faster than I expected. Sizing runs true, will order again.",
    listingRef: "#preview-1",
  },
  {
    id: "preview-rev-2",
    rating: 4,
    date: "28 чер. 2026",
    text: "Lovely design, exactly as pictured. Took a while to arrive but the seller kept me updated.",
    listingRef: "#preview-2",
  },
];

/** #91 — the shop's listings table. Two rows, same reasoning as the reviews
 *  above.
 *
 *  sales/revenue stay "—" rather than carrying illustrative numbers like the
 *  rest of this file: #91 delivers the listings, but those two columns need
 *  the sales estimate (#57/#58) and will still be empty after it lands. A
 *  preview is meant to show what its own ticket will produce — filling them
 *  in would promise a different ticket's work. */
export const PREVIEW_SHOP_LISTINGS: Listing[] = [
  {
    id: "preview-1",
    title: "Retro sunset graphic tee, unisex heavyweight cotton",
    shopId: "preview",
    shopName: "ExampleShop",
    views: "24 800",
    sales: "—",
    revenue: "—",
    ageMonths: 17,
    tags: ["retro", "sunset"],
    tracked: false,
    thumbGradient: ["#ef7c4a", "#c2418e"],
  },
  {
    id: "preview-2",
    title: "Minimalist mountain line art shirt",
    shopId: "preview",
    shopName: "ExampleShop",
    views: "11 350",
    sales: "—",
    revenue: "—",
    ageMonths: 8,
    tags: ["minimalist", "mountain"],
    tracked: false,
    thumbGradient: ["#5ad1e0", "#2f95a3"],
  },
];
