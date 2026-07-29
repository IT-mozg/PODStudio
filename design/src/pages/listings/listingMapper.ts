/* Maps the raw Flask /api/listings JSON shape (container.py's
   listings_payload()) onto design/'s Listing type. Kept as a standalone
   pure function — see httpListingsRepository.ts, ListingsPage's default
   repository, for where it's used against the live backend. */

import { formatCount, formatCurrency, formatPrice } from "../../shared/money";
import { mulberry32, seedFromString } from "../../shared/prng";
import type { Listing, ListingAttribute, ListingDetail } from "./types";

/** Shape actually returned by Flask's listings_payload() (container.py) —
 *  field names match the backend's snake_case JSON verbatim, not the
 *  frontend's camelCase Listing. Only the fields mapApiListing() reads are
 *  declared; the payload has more (thumb, etsy_url, prompt, ...) that this
 *  mapper doesn't need. */
export interface ApiListing {
  lid: string;
  title: string;
  shop_id: string;
  shop_name: string;
  views: number;
  // Modelled, not measured: views x the price-based conversion rate, and that
  // count times the listing's unit price (#57/#58, container.listings_payload).
  // The backend substitutes 0 when it cannot compute them, so unlike every
  // other Etsy-less field here these never arrive as null.
  sales: number;
  revenue: number;
  // Currency `revenue` is denominated in — the listing's own, not USD.
  revenue_currency: string;
  age_months: number;
  tags: string[];
  tracked: boolean;
}

// Thumbnail placeholder palette. Purely presentational — a listing with no
// loaded photo gets a stable gradient instead of a grey box. Only the search
// grid still needs these: the detail page renders the listing's real Etsy
// photos.
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

/** sales/revenue are the estimate from #57/#58, computed backend-side, and
 *  come through as plain numbers — including the 0 the backend uses when it
 *  has no price, no FX rate or no view count to work from. Hence
 *  formatCount/formatRevenue's null branch (which renders "—") is no longer
 *  reachable from this mapper; the shop mapper still relies on it. */
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
    thumbGradient: thumbGradientFor(raw.lid),
  };
}

/** The extra keys GET /api/listings/<lid> adds on top of ApiListing —
 *  container.listing_detail_payload(). Kept a separate interface because the
 *  search grid deliberately never receives them: a description alone is
 *  2–5 KB and there are 78 rows on a page. */
export interface ApiListingDetail extends ApiListing {
  description: string;
  // Etsy's own money shape, passed through raw so the frontend can format it
  // with the right currency symbol rather than assuming "$".
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
  // Estimated, not measured: Etsy exposes no conversion rate. Flask derives
  // it from the price bucket (models/conversion_rate.py) after converting to
  // USD, and sends null when it has no price or no exchange rate.
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

/** The rest of `when_made` is a set of year ranges Etsy revises over time
 *  ("2020_2025", "before_2005", ...). Deriving the label from the code
 *  rather than listing the ranges keeps this correct when Etsy shifts them,
 *  and avoids inventing a boundary that was never verified. */
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

/** Attributes in a fixed order, so the grid doesn't reshuffle between
 *  listings. Values Etsy has nothing for stay `null` and render as "—" —
 *  materials and style in particular come back as [] very often. */
function attributesOf(raw: ApiListingDetail): ListingAttribute[] {
  return [
    { label: "Категорія", value: raw.category_path || null },
    // `|| null`, not `?? `: the backend's default for a field Etsy omitted is
    // "", and an empty string would render as blank text styled like a real
    // value instead of "—".
    { label: "Хто зробив", value: raw.who_made ? WHO_MADE[raw.who_made] ?? raw.who_made : null },
    { label: "Коли зроблено", value: whenMadeLabel(raw.when_made) },
    { label: "Матеріали", value: raw.materials.length ? raw.materials.join(", ") : null },
    { label: "Стиль", value: raw.style.length ? raw.style.join(", ") : null },
    { label: "Час обробки", value: processingTime(raw.processing_min, raw.processing_max) },
    { label: "Персоналізація", value: raw.is_personalizable ? "Доступна" : "Немає" },
    // Etsy only reports *whether* variations exist, not what they vary by —
    // so this says "Є", never "розміри/кольори", which would be a guess.
    { label: "Варіанти", value: raw.has_variations ? "Є" : "Немає" },
    {
      label: "Виробничі партнери",
      // An empty list is not proof the seller prints in-house — only that
      // none was declared. "Хто зробив" above is the field that speaks to
      // that, so this stays "—" rather than claiming "друкує сам".
      value: raw.production_partners.length
        ? raw.production_partners
            .map((p) => [p.name, p.location].filter(Boolean).join(" · "))
            .join("; ")
        : null,
    },
  ];
}

export function mapApiListingDetail(raw: ApiListingDetail): ListingDetail {
  return {
    ...mapApiListing(raw),
    description: raw.description,
    price: formatPrice(raw.price_amount, raw.price_divisor, raw.price_currency),
    photos: raw.photos,
    attributes: attributesOf(raw),
    etsyUrl: raw.etsy_url,
    favorites: raw.num_favorers.toLocaleString("uk-UA"),
    // "≈" is the only thing marking this as an estimate anywhere in the UI —
    // the tile carries no caption and no tooltip — so it is part of the
    // formatted value rather than something a caller has to remember to add.
    //
    // Two decimals because the model's own steps are that fine: 2,27% and
    // 2,07% are adjacent buckets, and rounding to one would merge them.
    // `null` stays `null` rather than becoming "0%", which would read as a
    // measured zero.
    convRate:
      raw.conv_rate_pct === null
        ? null
        : `≈ ${raw.conv_rate_pct.toLocaleString("uk-UA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%`,
  };
}
