/* Deterministic "shop detail" data, derived from the summary Shop
   row already shown in the table (same sales/revenue numbers — no
   contradicting the list you clicked from) plus a seeded RNG for the
   parts the table doesn't carry (trend curve, price spread, reviews,
   individual listings). Same shape-of-contract as keywordsRepository:
   a pure builder function, no React. */

import { mulberry32, seedFromString } from "../../shared/prng";
import type { TrendPoint } from "../../shared/components/TrendChart";
import type { BarDatum } from "../../shared/components/BarBreakdown";
import type { RatingBreakdownDatum } from "../../shared/components/RatingBars";
import type { Shop } from "./types";

export interface ShopDetailStats {
  totalSales: string;
  totalRevenue: string;
  conversionRate: string;
  monthlySales: string;
  monthlyRevenue: string;
  avgPrice: string;
  mostExpensive: string;
  leastExpensive: string;
}

export interface ShopReview {
  id: string;
  rating: number;
  date: string;
  text: string;
  listingRef: string;
}

export interface ShopListingSummary {
  id: string;
  title: string;
  sales: string;
  revenue: string;
  price: string;
  ageLabel: string;
  rating: number;
  reviewCount: string;
  thumbGradient: [string, string];
}

export interface ShopDetail {
  stats: ShopDetailStats;
  revenueTrend: TrendPoint[];
  salesTrend: TrendPoint[];
  priceBreakdown: BarDatum[];
  ratingBreakdown: RatingBreakdownDatum[];
  reviews: ShopReview[];
  listings: ShopListingSummary[];
  category: string;
  handmade: boolean;
}

function parseCount(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

function parseMoneyShorthand(s: string): number {
  const m = s.match(/\$?([\d.]+)\s*(k|m)?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === "k") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  return n;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

const MONTH_LABELS = ["Сер", "Вер", "Жов", "Лис", "Гру", "Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип"];
const CATEGORIES = ["Clothing / T-shirts", "Home & Living / Wall Art", "Accessories / Mugs", "Clothing / Sweatshirts"];
const REVIEW_TEXTS = [
  "Great quality, exactly as pictured — shipped fast too!",
  "Loved it! Got this as a gift and they were thrilled.",
  "Super soft material, the print hasn't faded after washing.",
  "Exactly what I was looking for, will order again.",
  "Cute design, runs slightly large but still happy with it.",
  "Fast shipping and the packaging was really thoughtful.",
];

export function buildShopDetail(shop: Shop): ShopDetail {
  const rand = mulberry32(seedFromString(shop.id + shop.name));

  const totalSales = parseCount(shop.sales);
  const totalRevenue = parseMoneyShorthand(shop.revenue);
  const avgPriceNum = totalSales > 0 ? totalRevenue / totalSales : 20;
  const ageMonths = Math.max(1, shop.ageMonths);

  const monthlySalesNum = totalSales / ageMonths;
  const monthlyRevenueNum = totalRevenue / ageMonths;
  const conversionRate = 1 + rand() * 3;

  const stats: ShopDetailStats = {
    totalSales: totalSales.toLocaleString("uk-UA"),
    totalRevenue: formatMoney(totalRevenue),
    conversionRate: `${conversionRate.toFixed(2)}%`,
    monthlySales: Math.round(monthlySalesNum).toLocaleString("uk-UA"),
    monthlyRevenue: formatMoney(monthlyRevenueNum),
    avgPrice: `$${avgPriceNum.toFixed(2)}`,
    mostExpensive: `$${(avgPriceNum * (2.4 + rand())).toFixed(0)}`,
    leastExpensive: `$${Math.max(1, avgPriceNum * (0.15 + rand() * 0.2)).toFixed(0)}`,
  };

  // Sales and revenue share the same seasonal shape (same peak month,
  // same per-month noise draw) so a busy month for one is a busy
  // month for the other — they just scale to different baselines.
  const peakMonth = Math.floor(rand() * 12);
  const revenueTrend: TrendPoint[] = [];
  const salesTrend: TrendPoint[] = [];
  MONTH_LABELS.forEach((label, i) => {
    const distance = Math.min(Math.abs(i - peakMonth), 12 - Math.abs(i - peakMonth));
    const seasonal = Math.max(0.35, 1 - distance / 7);
    const noise = 0.85 + rand() * 0.3;
    revenueTrend.push({ label, value: Math.round(monthlyRevenueNum * seasonal * noise) });
    salesTrend.push({ label, value: Math.round(monthlySalesNum * seasonal * noise) });
  });

  const priceBucketLabels = ["$2-10", "$10-17", "$17-25", "$25-32", "$32-40", "$40-55"];
  const peakBucket = Math.min(priceBucketLabels.length - 1, Math.round((avgPriceNum / 55) * priceBucketLabels.length));
  const priceBreakdown: BarDatum[] = priceBucketLabels.map((label, i) => {
    const distance = Math.abs(i - peakBucket);
    const height = Math.max(0.03, 1 - distance * 0.32) * (0.7 + rand() * 0.3);
    return { label, value: Math.round(height * 1400) };
  });

  const ratingBase = Math.min(0.92, Math.max(0.55, (shop.rating - 3) / 2));
  const fiveStar = Math.round(ratingBase * 100 - rand() * 4);
  const fourStar = Math.round((100 - fiveStar) * (0.55 + rand() * 0.2));
  const threeStar = Math.round((100 - fiveStar - fourStar) * 0.5);
  const twoStar = Math.round((100 - fiveStar - fourStar - threeStar) * 0.5);
  const oneStar = Math.max(0, 100 - fiveStar - fourStar - threeStar - twoStar);
  const ratingBreakdown: RatingBreakdownDatum[] = [
    { stars: 5, pct: fiveStar },
    { stars: 4, pct: fourStar },
    { stars: 3, pct: threeStar },
    { stars: 2, pct: twoStar },
    { stars: 1, pct: oneStar },
  ];

  const reviews: ShopReview[] = Array.from({ length: 4 }, (_, i) => ({
    id: `${shop.id}-rev${i}`,
    rating: rand() > 0.15 ? 5 : 4,
    date: "24 лип.",
    text: REVIEW_TEXTS[Math.floor(rand() * REVIEW_TEXTS.length)],
    listingRef: `#${4000000 + Math.floor(rand() * 900000)}`,
  }));

  const gradientPairs: [string, string][] = [
    ["#ff9a5a", "#e0653f"],
    ["#7c6cff", "#5b4bdb"],
    ["#4ade80", "#22916a"],
    ["#f472b6", "#c2418e"],
    ["#5ad1e0", "#2f95a3"],
  ];
  const listingCount = Math.min(5, Math.max(3, shop.listings > 0 ? 5 : 3));
  let remainingSalesShare = 0.62;
  const listings: ShopListingSummary[] = Array.from({ length: listingCount }, (_, i) => {
    const share = i === 0 ? remainingSalesShare * (0.4 + rand() * 0.2) : remainingSalesShare * (0.15 + rand() * 0.15);
    remainingSalesShare = Math.max(0.02, remainingSalesShare - share);
    const listingSales = Math.max(20, Math.round(totalSales * share));
    const price = avgPriceNum * (0.7 + rand() * 0.8);
    return {
      id: `${shop.id}-l${i}`,
      title: `${shop.niche} — ${["design #1", "vintage style", "custom name", "bootleg tee", "graphic print"][i % 5]}`,
      sales: listingSales.toLocaleString("uk-UA"),
      revenue: formatMoney(listingSales * price),
      price: `$${price.toFixed(2)}`,
      ageLabel: `${Math.max(1, Math.round(rand() * ageMonths))} міс.`,
      rating: 4.6 + rand() * 0.4,
      reviewCount: Math.round(listingSales * (0.2 + rand() * 0.3)).toLocaleString("uk-UA"),
      thumbGradient: gradientPairs[i % gradientPairs.length],
    };
  });

  return {
    stats,
    revenueTrend,
    salesTrend,
    priceBreakdown,
    ratingBreakdown,
    reviews,
    listings,
    category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
    handmade: rand() > 0.7,
  };
}
