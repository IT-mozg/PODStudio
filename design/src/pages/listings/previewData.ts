/* Illustrative data for the detail-page blocks that have no backend yet.
 *
 * READ THIS BEFORE USING ANY OF IT.
 *
 * These are NOT fallbacks and NOT sample values to render when a fetch comes
 * back empty. They exist for exactly one purpose: to show, inside an explicit
 * "Приклад — не реальні дані" frame, what each block is meant to look like
 * once its ticket lands — so the intended design isn't lost while the feature
 * waits. #78 deleted the previous PRNG builders precisely because invented
 * numbers were indistinguishable from measured ones; the difference here is
 * the frame (NoDataNotice's `preview` slot dims them, marks them, and makes
 * them inert) and the fact that these are hand-written constants rather than
 * something generated per listing.
 *
 * Rules if you touch this file:
 *   - only ever pass these through NoDataNotice's `preview` prop;
 *   - never merge them into a real ListingDetail;
 *   - when a ticket below is closed, delete its constant along with the
 *     preview — a preview of a feature that already works is just a bug.
 */

import type { Listing, ListingTag, ScoreBreakdown, SeoCheckItem } from "./types";

/** #84 — Listing Score. Shows the ring + the four sub-scores it breaks down
 *  into, so it's clear the score is meant to be explainable, not a single
 *  opaque number. */
export const PREVIEW_SCORE: ScoreBreakdown = {
  overall: 78,
  title: { score: 88, note: "Ключове слово на початку, довжина в нормі." },
  tags: { score: 64, note: "Кілька тегів варто замінити на менш конкурентні." },
  photos: { score: 91, note: "Достатньо фото з різних ракурсів." },
  description: { score: 62, note: "Є повтори ключових слів на початку тексту." },
};

/** #85 — SEO checklist. Each item here is deliberately one that IS derivable
 *  from a real field (title length, tag count, photo count, tag repetition in
 *  the description), so the preview doubles as the spec for what to compute. */
export const PREVIEW_SEO_CHECKS: SeoCheckItem[] = [
  { status: "ok", title: "Заголовок — довжина в нормі", detail: "118 символів, ключове слово стоїть на початку." },
  { status: "bad", title: "Повтор тегів в описі", detail: "Перші два речення — перелік тегів без звʼязного тексту." },
  { status: "warn", title: "Заповнено 7 із 13 тегів", detail: "Шість вільних слотів — це шість втрачених запитів." },
  { status: "ok", title: "6 фото", detail: "Достатньо, щоб показати товар з різних боків." },
];

/** #56 — the tags audit table. Only used to illustrate the metric columns;
 *  the real table already renders the listing's real tag names beside "—". */
export const PREVIEW_TAGS: ListingTag[] = [
  { tag: "vintage cat shirt", volume: 12400, competition: 38, kd: 31, sparkline: [42, 45, 44, 51, 58, 55, 61, 64, 60, 68, 72, 70, 76, 81] },
  { tag: "funny cat tee", volume: 5800, competition: 71, kd: 68, sparkline: [70, 68, 72, 69, 65, 63, 66, 61, 58, 60, 57, 55, 53, 50] },
];

/** #86 — similar listings. Kept to two cards: enough to show the shape,
 *  little enough that nobody mistakes it for a loaded carousel. */
export const PREVIEW_SIMILAR: Listing[] = [
  {
    id: "preview-1",
    title: "Retro cat lover graphic tee",
    shopId: "preview",
    shopName: "ExampleShop",
    views: "18 400",
    sales: "1 240",
    revenue: "$29.4k",
    ageMonths: 21,
    tags: ["retro", "cat"],
    tracked: false,
    thumbGradient: ["#ef7c4a", "#c2418e"],
  },
  {
    id: "preview-2",
    title: "Minimalist cat line art shirt",
    shopId: "preview",
    shopName: "ExampleShop",
    views: "9 120",
    sales: "610",
    revenue: "$14.1k",
    ageMonths: 9,
    tags: ["minimalist", "cat"],
    tracked: false,
    thumbGradient: ["#5ad1e0", "#2f95a3"],
  },
];
