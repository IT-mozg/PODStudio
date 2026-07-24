/* Deterministic "listing detail" data, seeded off the Listing already
   shown in the table (same title/tags/thumbGradient — nothing here
   contradicts the row you clicked from). Same shape-of-contract as
   shopDetail.ts: a pure builder function, no React. */

import { mulberry32, seedFromString } from "../../shared/prng";
import type { Listing } from "./types";

export interface ListingDetailStats {
  monthlyViews: string;
  conversionRate: string;
  tagsFilled: string;
  photoCount: number;
  avgPrice: string;
}

export interface ListingTag {
  tag: string;
  volume: number;
  competition: number;
  kd: number;
  /** 14-point mini trend, newest last — same shape as Keyword.sparkline
   *  on Ключові слова, so the row reads identically. */
  sparkline: number[];
}

export type SeoCheckStatus = "ok" | "warn" | "bad";

export interface SeoCheckItem {
  status: SeoCheckStatus;
  title: string;
  detail: string;
}

export interface ScoreSub {
  score: number;
  note: string;
}

export interface ScoreBreakdown {
  overall: number;
  title: ScoreSub;
  tags: ScoreSub;
  photos: ScoreSub;
  description: ScoreSub;
}

export interface DescriptionSegment {
  text: string;
  flag?: "warn" | "bad";
}

export interface ListingAttribute {
  label: string;
  value: string;
}

export interface SimilarListing {
  id: string;
  title: string;
  price: string;
  sales: string;
  thumbGradient: [string, string];
}

export interface ListingDetail {
  stats: ListingDetailStats;
  photos: [string, string][];
  tags: ListingTag[];
  seoChecks: SeoCheckItem[];
  descriptionSegments: DescriptionSegment[];
  score: ScoreBreakdown;
  attributes: ListingAttribute[];
  similar: SimilarListing[];
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

const STOPWORDS = new Set(["a", "an", "the", "for", "and", "with", "of", "to", "on", "in", "your"]);
const MODIFIERS = [
  "gift", "shirt", "tee", "print", "poster", "custom", "vintage", "funny",
  "unisex", "wall art", "personalized", "birthday gift", "for her", "for him",
  "minimalist", "retro", "aesthetic", "trendy", "cute", "unique",
];

function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function buildTags(listing: Listing, rand: () => number): ListingTag[] {
  const words = titleWords(listing.title);
  const base = new Set(listing.tags.map((t) => t.toLowerCase()));
  const candidates = new Set(base);

  for (const w of words) {
    for (const m of MODIFIERS) candidates.add(`${w} ${m}`);
  }
  for (let i = 0; i < words.length - 1; i++) candidates.add(`${words[i]} ${words[i + 1]}`);

  const rest = Array.from(candidates).filter((t) => !base.has(t));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  const chosen = [...base, ...rest].slice(0, 13);

  return chosen.map((tag) => {
    const competition = Math.round(15 + rand() * 75);
    const kd = Math.round(Math.max(10, Math.min(96, competition * 0.7 + (rand() * 24 - 12))));
    const volume = Math.round(400 + rand() * 15600);

    let spark = 30 + rand() * 40;
    const sparkline = Array.from({ length: 14 }, () => {
      spark = Math.max(5, Math.min(100, spark + (rand() - 0.5) * 24));
      return Math.round(spark);
    });

    return { tag, volume, competition, kd, sparkline };
  });
}

function buildDescription(listing: Listing): DescriptionSegment[] {
  const stuffed = [...listing.tags.slice(0, 3), listing.tags[0]].join(" ");
  return [
    { text: "Ідеально для тих, хто шукає щось особливе! " },
    { text: stuffed, flag: "bad" },
    {
      text:
        " — цей дизайн стане улюбленим у вашій колекції. Якісні матеріали, приємний на дотик друк, який не тріскається і не вицвітає після прання. ",
    },
    { text: "Підходить на подарунок", flag: "warn" },
    {
      text:
        " для будь-якого приводу — день народження, свято чи просто щоб порадувати себе. Доступні кілька варіантів розміру та кольору.",
    },
  ];
}

function buildSeoChecks(listing: Listing, tagCount: number, photoCount: number, rand: () => number): SeoCheckItem[] {
  const titleLen = listing.title.length;
  const weakTags = Math.min(tagCount, 1 + Math.round(rand() * 3));

  return [
    titleLen <= 140
      ? { status: "ok", title: "Заголовок — довжина в нормі", detail: `${titleLen} символів, ключове слово стоїть на початку.` }
      : { status: "warn", title: "Заголовок задовгий", detail: `${titleLen} символів — Etsy може обрізати його у видачі.` },
    { status: "bad", title: "Keyword stuffing в описі", detail: "Друге речення — механічне повторення тегів без звʼязного тексту." },
    weakTags > 2
      ? { status: "warn", title: `${weakTags} теги з низьким попитом`, detail: "Варто замінити на менш конкурентні варіанти з таблиці нижче." }
      : { status: "ok", title: "Теги переважно з невисоким KD", detail: "Більшість тегів мають прийнятний баланс попиту й конкуренції." },
    photoCount >= 5
      ? { status: "ok", title: `${photoCount} фото, хороша різноманітність`, detail: "Достатньо для показу товару з різних ракурсів." }
      : { status: "warn", title: `Лише ${photoCount} фото`, detail: "Топ-конкуренти в ніші зазвичай додають 6+ фото." },
    { status: "warn", title: "Немає таблиці розмірів у фото", detail: "Розгляньте окремий слайд з size-chart, якщо це одяг." },
  ];
}

function scoreNote(score: number, good: string, mid: string, bad: string): string {
  if (score >= 80) return good;
  if (score >= 60) return mid;
  return bad;
}

function buildScore(listing: Listing, tags: ListingTag[], photoCount: number, rand: () => number): ScoreBreakdown {
  const avgKd = tags.reduce((s, t) => s + t.kd, 0) / tags.length;
  const titleLen = listing.title.length;

  const titleScore = Math.round(Math.max(55, Math.min(97, 96 - Math.max(0, titleLen - 60) * 0.6 - rand() * 6)));
  const tagsScore = Math.round(Math.max(35, Math.min(96, 100 - avgKd + rand() * 8 - 4)));
  const photosScore = Math.round(Math.max(45, Math.min(98, 55 + photoCount * 7 + rand() * 6)));
  const descriptionScore = Math.round(Math.max(40, Math.min(85, 60 + rand() * 20)));
  const overall = Math.round(titleScore * 0.25 + tagsScore * 0.3 + photosScore * 0.2 + descriptionScore * 0.25);

  return {
    overall,
    title: {
      score: titleScore,
      note: scoreNote(titleScore, "Ключове слово на початку, довжина в нормі.", "Непогано, але можна підсилити ключове слово.", "Заголовок варто переписати — слабкий збіг з ключовими словами."),
    },
    tags: {
      score: tagsScore,
      note: scoreNote(tagsScore, "Хороший баланс попиту й конкуренції.", "Кілька тегів варто замінити на менш конкурентні.", "Багато тегів з високою конкуренцією і низьким попитом."),
    },
    photos: {
      score: photosScore,
      note: scoreNote(photosScore, "Достатньо фото з різних ракурсів.", "Можна додати ще кілька фото деталей.", "Замало фото — покупці не бачать товар з різних боків."),
    },
    description: {
      score: descriptionScore,
      note: scoreNote(descriptionScore, "Чіткий, звʼязний текст без проблем.", "Є куди покращити — прибрати повтори ключових слів.", "Keyword stuffing і слабка структура тексту."),
    },
  };
}

const CATEGORIES = ["Одяг → Футболки", "Дім і декор → Постери", "Аксесуари → Кухлі", "Одяг → Світшоти", "Дім і декор → Стінний декор"];
const STYLES = ["Vintage / Retro", "Minimalist", "Bold Typography", "Line Art", "Whimsical"];

function buildAttributes(rand: () => number): ListingAttribute[] {
  const processingDays = 1 + Math.floor(rand() * 4);
  return [
    { label: "Категорія", value: CATEGORIES[Math.floor(rand() * CATEGORIES.length)] },
    { label: "Хто зробив", value: "Я" },
    { label: "Матеріал", value: "Бавовна 100%" },
    { label: "Стиль", value: STYLES[Math.floor(rand() * STYLES.length)] },
    { label: "Хто носить", value: "Унісекс, дорослі" },
    { label: "Час обробки", value: `1–${processingDays + 1} роб. дні` },
  ];
}

const SIMILAR_POOL = [
  "Dog mom era typography sweatshirt",
  "Cat lover vintage poster print",
  "Retro surf van sunset poster",
  "Minimalist mountain line art print",
  "Coffee lover mug — custom name",
  "Funny plant mom tote bag",
  "Vintage band tee bootleg style",
  "Custom name birthstone necklace",
];
const SIMILAR_GRADIENTS: [string, string][] = [
  ["#4ade80", "#22916a"],
  ["#f472b6", "#c2418e"],
  ["#7c6cff", "#5b4bdb"],
  ["#5ad1e0", "#2f95a3"],
  ["#ef7c4a", "#b3552c"],
];

function buildSimilar(listing: Listing, rand: () => number): SimilarListing[] {
  const remaining = SIMILAR_POOL.filter((t) => t !== listing.title);
  const picked: string[] = [];
  while (picked.length < 4 && remaining.length > 0) {
    picked.push(remaining.splice(Math.floor(rand() * remaining.length), 1)[0]);
  }
  return picked.map((title, i) => {
    const price = 12 + rand() * 24;
    const sales = Math.round(200 + rand() * 15000);
    return {
      id: `${listing.id}-sim${i}`,
      title,
      price: `$${price.toFixed(2)}`,
      sales: sales.toLocaleString("uk-UA"),
      thumbGradient: SIMILAR_GRADIENTS[i % SIMILAR_GRADIENTS.length],
    };
  });
}

const ACCENT_GRADIENTS: [string, string][] = [
  ["#ef7c4a", "#c2418e"],
  ["#5ad1e0", "#2f95a3"],
];

function buildPhotos(listing: Listing, rand: () => number): [string, string][] {
  const count = 4 + Math.floor(rand() * 3);
  const pairs: [string, string][] = [listing.thumbGradient, [listing.thumbGradient[1], listing.thumbGradient[0]]];
  for (let i = pairs.length; i < count; i++) pairs.push(ACCENT_GRADIENTS[i % ACCENT_GRADIENTS.length]);
  return pairs.slice(0, count);
}

export function buildListingDetail(listing: Listing): ListingDetail {
  const rand = mulberry32(seedFromString(listing.id + listing.title));

  const photos = buildPhotos(listing, rand);
  const tags = buildTags(listing, rand);
  const seoChecks = buildSeoChecks(listing, tags.length, photos.length, rand);
  const score = buildScore(listing, tags, photos.length, rand);
  const attributes = buildAttributes(rand);
  const similar = buildSimilar(listing, rand);

  const salesNum = parseCount(listing.sales);
  const revenueNum = parseMoneyShorthand(listing.revenue);
  const avgPrice = salesNum > 0 ? revenueNum / salesNum : 20;

  const stats: ListingDetailStats = {
    monthlyViews: Math.round(3000 + rand() * 15000).toLocaleString("uk-UA"),
    conversionRate: `${(1.5 + rand() * 3).toFixed(1)}%`,
    tagsFilled: `${tags.length} / 13`,
    photoCount: photos.length,
    avgPrice: `$${avgPrice.toFixed(2)}`,
  };

  return { stats, photos, tags, seoChecks, descriptionSegments: buildDescription(listing), score, attributes, similar };
}
