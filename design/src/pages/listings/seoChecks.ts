/* Verdicts built on top of seoSignals.ts (#85).
 *
 * Every check below reads one or more real fields of the listing. There is no
 * PRNG here and no default value: a check that cannot be computed is not
 * emitted as "ok" — it is emitted with status "unknown" and the number of the
 * ticket that will make it computable.
 *
 * The thresholds are a judgement call, agreed with the project owner, not
 * something Etsy publishes. Each item therefore carries a `why` — one plain
 * sentence on what to aim for and what it buys the seller. It deliberately
 * does not recite the thresholds: "менше 60 символів — bad" is our internal
 * rule, unreadable, and nothing the seller can act on.
 */

import type { DescriptionSegment, SeoCheckItem } from "./types";
import type { SeoSignals } from "./seoSignals";
import { DESCRIPTION_HEAD_CHARS, ETSY_LIMITS, SEO_THRESHOLDS, TITLE_HEAD_CHARS } from "./seoLimits";

// Etsy's caps and every threshold live in seoLimits.ts — edit them there, not
// here, so the wording below can't drift away from the rule it describes.
const MAX_TITLE_CHARS = ETSY_LIMITS.titleChars;
const MAX_TAGS = ETSY_LIMITS.tags;
const MAX_PHOTOS = ETSY_LIMITS.photos;

/** Ukrainian plural forms: 1 символ / 2 символи / 5 символів. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const chars = (n: number) => `${n} ${plural(n, "символ", "символи", "символів")}`;
const tagWord = (n: number) => `${n} ${plural(n, "тег", "теги", "тегів")}`;
const photoWord = (n: number) => `${n} ${plural(n, "фото", "фото", "фото")}`;

function titleCheck(s: SeoSignals): SeoCheckItem {
  const why = `Довший заголовок вміщує більше пошукових фраз, за якими покупець може знайти лістинг — Etsy дає на це до ${MAX_TITLE_CHARS} символів.`;
  // Etsy truncates past its cap; the audit measured the truncated title, so
  // say what got cut instead of grading the part nobody will ever see.
  if (s.titleOverLimitBy > 0) {
    return {
      status: "warn",
      title: `Заголовок довший за ліміт на ${chars(s.titleOverLimitBy)}`,
      detail: `Etsy показує лише перші ${MAX_TITLE_CHARS} символів — решту обрізано, і перевірки рахувалися саме по видимій частині.`,
      why,
    };
  }
  if (s.titleLength < SEO_THRESHOLDS.titleWarn) {
    return {
      status: "bad",
      title: `Заголовок закороткий — ${chars(s.titleLength)}`,
      detail: `Ліміт Etsy — ${MAX_TITLE_CHARS}; невикористані символи це запити, за якими лістинг не показується.`,
      why,
    };
  }
  if (s.titleLength < SEO_THRESHOLDS.titleOk) {
    return {
      status: "warn",
      title: `Заголовок — ${chars(s.titleLength)}`,
      detail: `Є запас до ${MAX_TITLE_CHARS} символів, куди можна додати ще ключових фраз.`,
      why,
    };
  }
  return {
    status: "ok",
    title: `Заголовок — ${chars(s.titleLength)}`,
    detail: `Ліміт Etsy (${MAX_TITLE_CHARS}) використано майже повністю.`,
    why,
  };
}

function titleHeadCheck(s: SeoSignals): SeoCheckItem {
  const why = `У пошуковій видачі покупець бачить лише початок заголовка, тож головну фразу варто ставити в перші ${TITLE_HEAD_CHARS} символів.`;
  if (s.tagInTitleHead) {
    return {
      status: "ok",
      title: "Ключове слово на початку заголовка",
      detail: `Тег «${s.tagInTitleHead}» стоїть у перших ${TITLE_HEAD_CHARS} символах.`,
      why,
    };
  }
  return {
    status: "warn",
    title: "На початку заголовка немає тега",
    detail: `Жоден із тегів не трапляється в перших ${TITLE_HEAD_CHARS} символах — саме їх бачить покупець у видачі.`,
    why,
  };
}

function tagCountCheck(s: SeoSignals): SeoCheckItem {
  const why = `Etsy дає рівно ${MAX_TAGS} тегів безкоштовно, і кожен незаповнений — це запит, за яким лістинг просто не покажуть.`;
  // Never phrased as "N із MAX" when N is above MAX — Etsy has raised its own
  // caps before (photos went 10 → 20), and "15 із 13" reads as a bug.
  if (s.tagCount >= MAX_TAGS) {
    return {
      status: "ok",
      title: `Заповнено ${tagWord(s.tagCount)}`,
      detail: `Усі ${MAX_TAGS} слотів використано.`,
      why,
    };
  }
  const free = MAX_TAGS - s.tagCount;
  return {
    status: s.tagCount >= SEO_THRESHOLDS.tagsWarn ? "warn" : "bad",
    title: `Заповнено ${s.tagCount} із ${MAX_TAGS} тегів`,
    detail: `${free} ${plural(free, "вільний слот", "вільні слоти", "вільних слотів")} — стільки ж втрачених запитів.`,
    why,
  };
}

function tagQualityCheck(s: SeoSignals): SeoCheckItem {
  const why =
    "Тег працює найкраще як окрема фраза з двох-трьох слів: повтори й однослівні теги витрачають слот на запит, за яким усе одно не пробитися.";

  if (s.duplicateTags.length) {
    return {
      status: "bad",
      title: `Дублікати серед тегів: ${tagWord(s.duplicateTags.length)}`,
      detail: `Повторюються: ${s.duplicateTags.map((tag) => `«${tag}»`).join(", ")}. Кожен дублікат марно займає слот.`,
      why,
    };
  }

  const problems: string[] = [];
  if (s.tagCount > 0 && s.singleWordTags.length * 2 > s.tagCount) {
    problems.push(`${tagWord(s.singleWordTags.length)} складаються з одного слова — вони конкурують з усім ринком`);
  }
  if (s.overlappingTags.length) {
    const sample = s.overlappingTags.slice(0, 2).map(([a, b]) => `«${a}» ↔ «${b}»`).join(", ");
    problems.push(`є теги, що поглинають один одного: ${sample}`);
  }

  if (problems.length) {
    return {
      status: "warn",
      title: "Теги перекриваються або надто загальні",
      detail: `${problems.join("; ")}.`,
      why,
    };
  }

  return {
    status: "ok",
    title: "Теги без дублікатів і перекриттів",
    detail: "Кожен тег — окрема фраза, жоден слот не витрачено двічі.",
    why,
  };
}

function photoCheck(s: SeoSignals): SeoCheckItem {
  const why = `Що більше ракурсів, то менше сумнівів у покупця перед покупкою — Etsy показує до ${MAX_PHOTOS} фото.`;
  if (s.photoCount >= SEO_THRESHOLDS.photosOk) {
    return {
      status: "ok",
      title: s.photoCount >= MAX_PHOTOS ? photoWord(s.photoCount) : `${photoWord(s.photoCount)} із ${MAX_PHOTOS}`,
      detail: "Достатньо, щоб показати товар з різних боків.",
      why,
    };
  }
  const title = `${photoWord(s.photoCount)} із ${MAX_PHOTOS}`;
  if (s.photoCount >= SEO_THRESHOLDS.photosWarn) {
    return { status: "warn", title, detail: `Є місце ще для ${MAX_PHOTOS - s.photoCount} фото.`, why };
  }
  return { status: "bad", title, detail: "Мало ракурсів — покупцеві бракує підстав натиснути «купити».", why };
}

function stuffingCheck(s: SeoSignals): SeoCheckItem {
  const why =
    "Ключове слово в описі має звучати природно: часті повтори читаються як спам і відлякують покупця. Підсвічене нижче — це його реальні входження.";
  // Named off the same number the signals already computed, so the wording
  // and the threshold can never disagree about which keyword is the worst.
  // An empty result after a failed scan is "not measured", not "nothing
  // found" — reporting ok here would be a pass nobody checked.
  if (s.keywordScanFailed) {
    return {
      status: "unknown",
      title: "Повтори ключів не перевірено",
      detail: "Пошук ключових слів у тексті не вдалося виконати для цього лістинга.",
      why,
    };
  }

  const worst = s.keywordHits.find((hit) => hit.spans.length === s.maxKeywordRepeats);
  const top = worst ? { keyword: worst.keyword, count: worst.spans.length } : null;

  if (!top || s.maxKeywordRepeats < SEO_THRESHOLDS.stuffingWarn) {
    return {
      status: "ok",
      title: "Опис без надмірних повторів",
      detail: top
        ? `Найчастіший ключ — «${top.keyword}», ${top.count} ${plural(top.count, "входження", "входження", "входжень")}.`
        : "Жоден тег не повторюється в описі.",
      why,
    };
  }

  return {
    status: s.maxKeywordRepeats >= SEO_THRESHOLDS.stuffingBad ? "bad" : "warn",
    title: `Повтор ключа в описі — ${top.count} ${plural(top.count, "раз", "рази", "разів")}`,
    detail: `«${top.keyword}» повторюється ${top.count} ${plural(top.count, "раз", "рази", "разів")} — підсвічено в тексті нижче.`,
    why,
  };
}

function descriptionLengthCheck(s: SeoSignals): SeoCheckItem {
  const why =
    "Докладний опис знімає питання покупця ще до замовлення і дає більше тексту зовнішньому пошуку.";
  if (s.descriptionLength < SEO_THRESHOLDS.descriptionWarn) {
    return {
      status: "bad",
      title: `Опис закороткий — ${chars(s.descriptionLength)}`,
      detail: "Такий опис не відповідає на питання покупця і не дає тексту зовнішньому пошуку.",
      why,
    };
  }
  if (s.descriptionLength < SEO_THRESHOLDS.descriptionOk) {
    return {
      status: "warn",
      title: `Опис — ${chars(s.descriptionLength)}`,
      detail: "Є куди рости: розділи, догляд, розміри, відповіді на часті питання.",
      why,
    };
  }
  return {
    status: "ok",
    title: `Опис — ${chars(s.descriptionLength)}`,
    detail: "Достатньо тексту, щоб покрити і запити, і питання покупця.",
    why,
  };
}

function descriptionHeadCheck(s: SeoSignals): SeoCheckItem {
  const why = `Перші ${DESCRIPTION_HEAD_CHARS} символів опису Google показує у своїй видачі — саме там варто мати ключову фразу.`;
  if (s.tagsInFirst160.length) {
    return {
      status: "ok",
      title: "Ключові слова на початку опису",
      detail: `У перших ${DESCRIPTION_HEAD_CHARS} символах: ${s.tagsInFirst160.slice(0, 3).map((tag) => `«${tag}»`).join(", ")}.`,
      why,
    };
  }
  return {
    status: "warn",
    title: "На початку опису немає тегів",
    detail: `Перші ${DESCRIPTION_HEAD_CHARS} символів потрапляють у видачу Google — там варто мати ключову фразу.`,
    why,
  };
}

function descriptionStructureCheck(s: SeoSignals): SeoCheckItem {
  const why = "Порожні рядки розбивають опис на абзаци — суцільну стіну тексту з телефона майже ніхто не дочитує.";
  if (s.hasParagraphBreaks) {
    return { status: "ok", title: "Опис розбитий на абзаци", detail: "Текст читається з телефона.", why };
  }
  return {
    status: "warn",
    title: "Опис — суцільний текст",
    detail: "Жодного порожнього рядка: на мобільному це стіна тексту.",
    why,
  };
}

/** Blocked by #56 — the search-volume engine. Shown, not hidden, so it is
 *  clear the check exists and why it has no answer; never given a number. */
function tagDemandCheck(): SeoCheckItem {
  return {
    status: "unknown",
    title: "Теги з низьким попитом",
    detail: "Потрібен обсяг пошуку — Etsy його не віддає, рушій ще не підключено.",
    why: "Щоб сказати, чи є попит на тег, потрібне зовнішнє джерело обсягу пошуку — Etsy таких даних не дає, а вигадувати число тут не будемо.",
    todoIssue: 56,
  };
}

/** The full checklist for one listing, in reading order: title, tags,
 *  photos, description. */
export function buildSeoChecks(signals: SeoSignals): SeoCheckItem[] {
  const checks: SeoCheckItem[] = [
    titleCheck(signals),
    titleHeadCheck(signals),
    tagCountCheck(signals),
    tagQualityCheck(signals),
    photoCheck(signals),
  ];

  if (!signals.hasDescription) {
    // Same test FlaggedDescription uses, so a whitespace-only description
    // can't be graded here while the block beside it calls it missing.
    // Saying "no keyword stuffing" about it would read as a pass.
    checks.push({
      status: "bad",
      title: "Опису немає",
      detail: "Etsy не повертає опису для цього лістинга, тож перевірки тексту пропущено.",
      why: "Без тексту опису немає чого перевіряти на повтори, довжину й структуру — почніть з того, щоб його додати.",
    });
  } else {
    checks.push(
      descriptionLengthCheck(signals),
      descriptionHeadCheck(signals),
      descriptionStructureCheck(signals),
      stuffingCheck(signals),
    );
  }

  checks.push(tagDemandCheck());
  return checks;
}

/** Cuts the description into segments along the keyword hits, so a
 *  highlighted piece is always literally the text at those offsets.
 *
 *  Takes the description off the signals rather than as its own argument:
 *  the offsets only mean anything against the exact string they were measured
 *  on, and a second parameter let a caller pair them with a different one.
 *
 *  A description with no matches comes back as one unflagged segment; an
 *  empty one comes back as an empty array (there is nothing to render, and
 *  FlaggedDescription shows its own empty state instead). */
export function buildDescriptionSegments(signals: SeoSignals): DescriptionSegment[] {
  const description = signals.description;
  if (!description) return [];

  const spans = signals.keywordHits
    .flatMap((hit) => hit.spans.map(([start, end]) => ({ start, end, flag: hit.source })))
    .sort((a, b) => a.start - b.start);

  if (!spans.length) return [{ text: description }];

  const segments: DescriptionSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: description.slice(cursor, span.start) });
    segments.push({ text: description.slice(span.start, span.end), flag: span.flag });
    cursor = span.end;
  }
  if (cursor < description.length) segments.push({ text: description.slice(cursor) });

  return segments;
}
