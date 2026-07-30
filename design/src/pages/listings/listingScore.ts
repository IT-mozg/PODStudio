/* The Listing Score (#84) — a verdict over seoSignals.ts, never a measurement
 * of its own. Same input as the SEO checklist (#85), so the ring and the list
 * below it cannot disagree about one listing.
 *
 * Continuous, not stepped: 118 title characters is 0.92 of what's possible,
 * not "the same bracket as 100". Every signal goes through ramp(), whose nodes
 * are the thresholds from seoLimits.ts — a threshold bends the curve instead
 * of cutting it. 100 means Etsy's own maximum (140 characters, 13 tags, 20
 * photos), so "ok" lands near 0.85 and leaves headroom above merely fine.
 *
 * No PRNG, no clock, no network: the same listing always scores the same. */

import type { ScoreBreakdown, ScoreSub } from "./types";
import type { SeoSignals } from "./seoSignals";
import {
  DESCRIPTION_HEAD_CHARS,
  ETSY_LIMITS,
  SCORE_TUNING,
  SEO_THRESHOLDS,
  TITLE_HEAD_CHARS,
} from "./seoLimits";
import { chars, photoWord, plural, tagWord } from "./seoWording";

const PERCENT = 100;

/** Relative weights inside each sub-score. Only the ratios matter — combine()
 *  divides by the total of whatever was actually measured. */
const WEIGHTS = {
  /** Tag slots filled vs. how many of them are distinct phrases. */
  tagSlots: 0.5,
  tagQuality: 0.5,
  /** #56 (tag difficulty / search volume) will fill this one in. */
  tagDifficulty: 0.5,
  descriptionLength: 0.4,
  descriptionHead: 0.2,
  descriptionStructure: 0.2,
  descriptionStuffing: 0.2,
} as const;

/** A node on a scoring curve: [raw measurement, fraction of the weight]. */
type CurveNode = readonly [number, number];

/** Piecewise-linear scale: straight lines between nodes, flat beyond the ends.
 *  Nodes ascend by x; equal x values (a clamped threshold can collapse two
 *  into one) resolve to the later node. */
function ramp(value: number, nodes: readonly CurveNode[]): number {
  if (value <= nodes[0][0]) return nodes[0][1];
  for (let i = 1; i < nodes.length; i += 1) {
    const [prevX, prevY] = nodes[i - 1];
    const [x, y] = nodes[i];
    if (value <= x) {
      if (x === prevX) return y;
      return prevY + ((value - prevX) / (x - prevX)) * (y - prevY);
    }
  }
  return nodes[nodes.length - 1][1];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface Component {
  weight: number;
  /** `null` = not measured: the component drops out of the weighting instead
   *  of scoring zero. */
  fraction: number | null;
}

function combine(components: readonly Component[]): number {
  let weighted = 0;
  let total = 0;
  for (const { weight, fraction } of components) {
    if (fraction === null) continue;
    weighted += weight * clamp01(fraction);
    total += weight;
  }
  // Guard, not a fallback: unreachable while every sub-score keeps one
  // unconditional component, and a 0 here would be an invented verdict.
  if (total === 0) return 0;
  return Math.round((weighted / total) * PERCENT);
}

/** "на 12-му символі" — offsets are 0-based, positions are not. */
function position(offset: number): string {
  return `на ${offset + 1}-му символі`;
}

// ---- title ----------------------------------------------------------------

const TITLE_LENGTH_CURVE: readonly CurveNode[] = [
  [0, 0],
  [SEO_THRESHOLDS.titleWarn, 0.5],
  [SEO_THRESHOLDS.titleOk, 0.85],
  [ETSY_LIMITS.titleChars, 1],
];

/** What's left of the length score once Etsy cut the tail off. */
const TITLE_OVERFLOW_CURVE: readonly CurveNode[] = [
  [0, 1],
  [ETSY_LIMITS.titleChars * SCORE_TUNING.titleOverflowPenaltyAt, 0.7],
];

const TAG_POSITION_CURVE: readonly CurveNode[] = [
  [0, 1],
  [TITLE_HEAD_CHARS, 0.45],
  [ETSY_LIMITS.titleChars, 0.15],
];

/** Length carries the sub-score and placement scales it: search space you
 *  didn't use can't be earned back by where you put the keyword. Splitting the
 *  weight additively gave a seven-character title half marks for containing
 *  one tag, above a long well-built title that repeated none. */
function titleScore(s: SeoSignals): ScoreSub {
  const length = ramp(s.titleLength, TITLE_LENGTH_CURVE) * ramp(s.titleOverLimitBy, TITLE_OVERFLOW_CURVE);
  const placement = s.tagTitleOffset === null ? 0 : ramp(s.tagTitleOffset, TAG_POSITION_CURVE);
  const floor = SCORE_TUNING.titlePlacementFloor;

  const parts = [
    s.titleOverLimitBy > 0
      ? `${chars(s.titleLength)} + ${s.titleOverLimitBy} понад ліміт`
      : `${chars(s.titleLength)} із ${ETSY_LIMITS.titleChars}`,
    s.tagTitleOffset === null
      ? "жодного тега в заголовку"
      : `тег ${position(s.tagTitleOffset)}`,
  ];

  return {
    score: combine([{ weight: 1, fraction: length * (floor + (1 - floor) * placement) }]),
    note: `${parts.join(", ")}.`,
  };
}

// ---- tags -----------------------------------------------------------------

const TAG_SLOTS_CURVE: readonly CurveNode[] = [
  [0, 0],
  [SEO_THRESHOLDS.tagsWarn, 0.75],
  [ETSY_LIMITS.tags, 1],
];

function tagScore(s: SeoSignals): ScoreSub {
  if (s.tagCount === 0) {
    return { score: 0, note: `Тегів немає — усі ${ETSY_LIMITS.tags} слотів вільні.` };
  }

  // Slots, so the share moves one tag at a time — see SeoSignals.weakTags.
  const healthy = Math.max(0, s.tagCount - s.weakTags.length);

  return {
    score: combine([
      { weight: WEIGHTS.tagSlots, fraction: ramp(s.tagCount, TAG_SLOTS_CURVE) },
      { weight: WEIGHTS.tagQuality, fraction: healthy / s.tagCount },
      { weight: WEIGHTS.tagDifficulty, fraction: null },
    ]),
    // Names all three reasons weakTags counts, or the note would contradict
    // the checklist's "без дублікатів і перекриттів" on a single-word tag.
    note: s.weakTags.length
      ? `${s.tagCount} із ${ETSY_LIMITS.tags} слотів, ${tagWord(s.weakTags.length)} витрачено на повтори, перекриття чи одне слово.`
      : `${s.tagCount} із ${ETSY_LIMITS.tags} слотів, кожен — окрема фраза.`,
  };
}

// ---- photos ---------------------------------------------------------------

const PHOTO_CURVE: readonly CurveNode[] = [
  [0, 0],
  [SEO_THRESHOLDS.photosWarn, 0.5],
  [SEO_THRESHOLDS.photosOk, 0.85],
  [ETSY_LIMITS.photos, 1],
];

function photoScore(s: SeoSignals): ScoreSub {
  return {
    score: combine([{ weight: 1, fraction: ramp(s.photoCount, PHOTO_CURVE) }]),
    note: `${photoWord(s.photoCount)} із ${ETSY_LIMITS.photos}.`,
  };
}

// ---- description ----------------------------------------------------------

const DESCRIPTION_LENGTH_CURVE: readonly CurveNode[] = [
  [0, 0],
  [SEO_THRESHOLDS.descriptionWarn, 0.5],
  [SEO_THRESHOLDS.descriptionOk, 0.9],
  [SEO_THRESHOLDS.descriptionOk * SCORE_TUNING.descriptionFullCreditAt, 1],
];

const DESCRIPTION_HEAD_CURVE: readonly CurveNode[] = [
  [0, 0],
  [1, 0.6],
  [SCORE_TUNING.headTagsTarget, 1],
];

const PARAGRAPH_SIZE_CURVE: readonly CurveNode[] = [
  [0, 1],
  [SCORE_TUNING.comfortableParagraphChars, 1],
  [SCORE_TUNING.unreadableParagraphChars, 0.3],
];

/** Flat until the last repeat the checklist still calls clean: interpolating
 *  from zero docked a single, perfectly normal mention of the keyword while
 *  the check beside it read "без надмірних повторів". */
const STUFFING_CURVE: readonly CurveNode[] = [
  [0, 1],
  [SEO_THRESHOLDS.stuffingWarn - 1, 1],
  [SEO_THRESHOLDS.stuffingBad, 0.2],
  [SEO_THRESHOLDS.stuffingBad * SCORE_TUNING.stuffingZeroAt, 0],
];

function descriptionScore(s: SeoSignals): ScoreSub {
  // The checklist's own test, so a whitespace-only description can't be graded
  // here while the page calls it missing.
  if (!s.hasDescription) {
    return { score: 0, note: "Опису немає — перевіряти нічого." };
  }

  // Below "too short" there is nothing to structure, so a single paragraph is
  // not a fault worth deducting for.
  const gradeStructure = s.descriptionLength >= SEO_THRESHOLDS.descriptionWarn;
  // A flat penalty on top of the size curve, not instead of it: a
  // 400-character block is not the wall of text a 3000-character one is, and
  // one blank line must not swing the sub-score by a sixth.
  const paragraphs = Math.max(1, s.paragraphCount);
  const structure = ramp(s.descriptionLength / paragraphs, PARAGRAPH_SIZE_CURVE)
    * (paragraphs === 1 ? SCORE_TUNING.singleParagraphFraction : 1);

  const parts = [
    chars(s.descriptionLength),
    `${s.paragraphCount} ${plural(s.paragraphCount, "абзац", "абзаци", "абзаців")}`,
    s.tagsInFirst160.length
      ? `${tagWord(s.tagsInFirst160.length)} у перших ${DESCRIPTION_HEAD_CHARS}`
      : `жодного тега в перших ${DESCRIPTION_HEAD_CHARS}`,
    // An empty result after a failed scan is "not measured", never "clean".
    s.keywordScanFailed
      ? "повтори не перевірено"
      : s.maxKeywordRepeats === 0
        ? "жоден ключ не трапляється в тексті"
        : `найчастіший ключ — ${s.maxKeywordRepeats} ${plural(s.maxKeywordRepeats, "раз", "рази", "разів")}`,
  ];

  return {
    score: combine([
      { weight: WEIGHTS.descriptionLength, fraction: ramp(s.descriptionLength, DESCRIPTION_LENGTH_CURVE) },
      { weight: WEIGHTS.descriptionHead, fraction: ramp(s.tagsInFirst160.length, DESCRIPTION_HEAD_CURVE) },
      { weight: WEIGHTS.descriptionStructure, fraction: gradeStructure ? structure : null },
      { weight: WEIGHTS.descriptionStuffing, fraction: s.keywordScanFailed ? null : ramp(s.maxKeywordRepeats, STUFFING_CURVE) },
    ]),
    note: `${parts.join(", ")}.`,
  };
}

// ---- the whole thing ------------------------------------------------------

/** Equal weights on purpose: a low overall stays explainable in one sentence
 *  ("the description is weak — that's a quarter of the score"). */
export function buildListingScore(signals: SeoSignals): ScoreBreakdown {
  const title = titleScore(signals);
  const tags = tagScore(signals);
  const photos = photoScore(signals);
  const description = descriptionScore(signals);

  const subs = [title, tags, photos, description];
  const overall = Math.round(subs.reduce((sum, sub) => sum + sub.score, 0) / subs.length);

  return { overall, title, tags, photos, description };
}
