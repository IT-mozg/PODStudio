/* The only file that knows Flask's snake_case JSON for listings
   (container.py's listings_payload). Everything above it sees camelCase. */

import { formatCount, formatCurrency, formatPrice } from "../../shared/money";
import { mulberry32, seedFromString } from "../../shared/prng";
import type { Listing, ListingAttribute, ListingDetail } from "./types";

/** Only the fields mapApiListing() reads — the payload carries more. */
export interface ApiListing {
  lid: string;
  title: string;
  /** "" when the backend had no URL — see container.ui_thumb. */
  thumb: string;
  shop_id: string;
  shop_name: string;
  views: number;
  // Modelled, not measured (#57/#58). Never null: the backend sends 0.
  sales: number;
  revenue: number;
  // The listing's own currency, not USD.
  revenue_currency: string;
  // null when Etsy gave no creation date — distinct from 0, "under a month".
  age_months: number | null;
  tags: string[];
  tracked: boolean;
}

// Presentational only: a listing with no loaded photo gets a stable gradient
// instead of a grey box. Search grid only — the detail page has real photos.
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

export function mapApiListing(raw: ApiListing): Listing {
  return {
    id: raw.lid,
    title: raw.title,
    shopId: raw.shop_id,
    shopName: raw.shop_name,
    views: raw.views.toLocaleString("uk-UA"),
    sales: formatCount(raw.sales),
    revenue: formatCurrency(raw.revenue, raw.revenue_currency),
    ageMonths: raw.age_months,
    tags: raw.tags,
    tracked: raw.tracked,
    thumbUrl: raw.thumb ?? "",
    thumbGradient: thumbGradientFor(raw.lid),
  };
}

/** What container.listing_detail_payload() adds on top of ApiListing. Kept
 *  separate because the grid must never receive it: a description alone is
 *  2-5 KB and there are 78 rows on a page. */
export interface ApiListingDetail extends ApiListing {
  description: string;
  // Etsy's raw money shape, so the frontend can use the right symbol.
  price_amount: number | null;
  price_divisor: number;
  price_currency: string;
  photos: string[];
  etsy_url: string;
  category_path: string;
  who_made: string;
  when_made: string;
  materials: string[];
  style: string[];
  processing_min: number | null;
  processing_max: number | null;
  is_personalizable: boolean;
  has_variations: boolean;
  num_favorers: number;
  production_partners: { name: string; location: string }[];
  // Estimated, not measured — Etsy exposes no conversion rate. Flask derives
  // it from the price bucket (models/conversion_rate.py).
  conv_rate_pct: number | null;
}

/** Etsy's enum values are API constants, not display text. Anything not
 *  listed falls back to the raw value rather than to a guess. */
const WHO_MADE: Record<string, string> = {
  i_did: "Продавець",
  someone_else: "Інша особа чи компанія",
  collective: "Творчий колектив",
};

const WHEN_MADE: Record<string, string> = {
  made_to_order: "На замовлення",
  vintage: "Вінтаж",
};

/** The rest of `when_made` is year ranges Etsy revises over time
 *  ("2020_2025", "before_2005"). Derived from the code rather than listed,
 *  so a shifted range can't turn into an invented boundary. */
function whenMadeLabel(raw: string): string | null {
  if (!raw) return null;
  if (WHEN_MADE[raw]) return WHEN_MADE[raw];

  const range = raw.match(/^(\d{4})_(\d{4})$/);
  if (range) return `${range[1]}–${range[2]}`;

  const before = raw.match(/^before_(\d{4})$/);
  if (before) return `До ${before[1]}`;

  return raw;
}

function processingTime(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return min === max ? `${min} роб. дн.` : `${min}–${max} роб. дн.`;
  }
  return `${min ?? max} роб. дн.`;
}

/** Fixed order, so the grid doesn't reshuffle between listings. Missing
 *  values stay `null` and render as "—". */
function attributesOf(raw: ApiListingDetail): ListingAttribute[] {
  return [
    { label: "Категорія", value: raw.category_path || null },
    // `|| null`, not `??`: the backend's default is "", which would render as
    // blank text styled like a real value instead of "—".
    { label: "Хто зробив", value: raw.who_made ? WHO_MADE[raw.who_made] ?? raw.who_made : null },
    { label: "Коли зроблено", value: whenMadeLabel(raw.when_made) },
    { label: "Матеріали", value: raw.materials.length ? raw.materials.join(", ") : null },
    { label: "Стиль", value: raw.style.length ? raw.style.join(", ") : null },
    { label: "Час обробки", value: processingTime(raw.processing_min, raw.processing_max) },
    { label: "Персоналізація", value: raw.is_personalizable ? "Доступна" : "Немає" },
    // Etsy reports only *whether* variations exist, so never "розміри".
    { label: "Варіанти", value: raw.has_variations ? "Є" : "Немає" },
    {
      label: "Виробничі партнери",
      // An empty list means none was declared, not that the seller prints
      // in-house — so "—", never "друкує сам".
      value: raw.production_partners.length
        ? raw.production_partners
            .map((p) => [p.name, p.location].filter(Boolean).join(" · "))
            .join("; ")
        : null,
    },
  ];
}

/** Under a month old (0) or with no creation date (null) there is nothing to
 *  divide by, so the lifetime total stands and the tile relabels itself. */
function viewsPerMonth(views: number, ageMonths: number | null): number {
  if (ageMonths === null || ageMonths < 1) return views;
  return Math.round(views / ageMonths);
}

export function mapApiListingDetail(raw: ApiListingDetail): ListingDetail {
  return {
    ...mapApiListing(raw),
    viewsPerMonth: viewsPerMonth(raw.views, raw.age_months).toLocaleString("uk-UA"),
    description: raw.description,
    price: formatPrice(raw.price_amount, raw.price_divisor, raw.price_currency),
    photos: raw.photos,
    attributes: attributesOf(raw),
    etsyUrl: raw.etsy_url,
    favorites: raw.num_favorers.toLocaleString("uk-UA"),
    // "≈" is the only estimate marker in the UI, so it's baked into the value
    // rather than left for a caller to remember. Two decimals because the
    // model's buckets are that fine — 2,27% and 2,07% are adjacent.
    convRate:
      raw.conv_rate_pct === null
        ? null
        : `≈ ${raw.conv_rate_pct.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%`,
  };
}
