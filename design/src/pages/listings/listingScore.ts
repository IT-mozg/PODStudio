/* The Listing Score (#84) — a verdict over seoSignals.ts, never a measurement
 * of its own. Same input as the SEO checklist (#85), which is what stops the
 * ring and the list below it disagreeing about one listing.
 *
 * Every number is continuous, not stepped: 118 title characters is 0.92 of
 * what's possible, not "the same bracket as 100". Each signal goes through
 * ramp() — a piecewise-linear curve whose nodes are the thresholds from
 * seoLimits.ts, so a threshold bends the curve instead of cutting it.
 *
 * 100 means Etsy's own maximum (140 characters, 13 tags, 20 photos), not our
 * "ok" threshold — that one sits at ~0.85, leaving headroom above a listing
 * that is merely fine.
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

/** A node on a scoring curve: [raw measurement, fraction of the weight]. */
type CurveNode = readonly [number, number];

/** Piecewise-linear scale. Straight lines between the nodes, flat beyond the
 *  ends. Nodes must ascend by x; equal x values are allowed (a clamped
 *  threshold can collapse two into one) and resolve to the later node. */
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
  /** `null` means "not measured" — the component drops out of the weighting
   *  rather than scoring zero. That is the one mechanism behind all three
   *  cases: a failed keyword scan, structure on a description too short to
   *  judge, and the tag-difficulty component #56 will fill in. Punishing what
   *  nobody measured would be exactly the invented number this file exists to
   *  avoid. */
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
  // Unreachable while every sub-score keeps one unconditional component, and
  // a 0 here would be an invented verdict rather than a measured one — so it
  // stays a guard, not a fallback anyone should rely on.
  if (total === 0) return 0;
  return Math.round((weighted / total) * 100);
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

/** Length carries the sub-score and placement scales it, rather than the two
 *  splitting the weight between them. Additive weights got both ends wrong: a
 *  seven-character title scored half marks because its single word happened to
 *  be a tag, while a long, well-built title that never repeated one scored
 *  below it. Search space you didn't use can't be earned back by where you put
 *  the keyword. */
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
      { weight: 0.5, fraction: ramp(s.tagCount, TAG_SLOTS_CURVE) },
      { weight: 0.5, fraction: healthy / s.tagCount },
      // #56 lands here: tag difficulty / search volume. Until then it is
      // unmeasured, and the weighting above simply ignores it.
      { weight: 0.5, fraction: null },
    ]),
    note: `${s.tagCount} із ${ETSY_LIMITS.tags} слотів, ${tagWord(healthy)} без повторів і перекриттів.`,
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
  [SEO_THRESHOLDS.descriptionOk * 2, 1],
];

const DESCRIPTION_HEAD_CURVE: readonly CurveNode[] = [
  [0, 0],
  [1, 0.6],
  [SCORE_TUNING.headTagsTarget, 1],
];

/** Characters per paragraph — a wall of text reads badly on a phone however
 *  well written it is. */
const PARAGRAPH_SIZE_CURVE: readonly CurveNode[] = [
  [0, 1],
  [SCORE_TUNING.comfortableParagraphChars, 1],
  [SCORE_TUNING.unreadableParagraphChars, 0.3],
];

const STUFFING_CURVE: readonly CurveNode[] = [
  [0, 1],
  [SEO_THRESHOLDS.stuffingWarn, 0.6],
  [SEO_THRESHOLDS.stuffingBad, 0.2],
  [SEO_THRESHOLDS.stuffingBad * 2, 0],
];

function descriptionScore(s: SeoSignals): ScoreSub {
  // Same test FlaggedDescription and the checklist use, so a whitespace-only
  // description can't be graded here while the page calls it missing.
  if (!s.hasDescription) {
    return { score: 0, note: "Опису немає — перевіряти нічого." };
  }

  // Below the "too short" threshold there is nothing to structure, so a
  // single paragraph is not a fault worth deducting for.
  const gradeStructure = s.descriptionLength >= SEO_THRESHOLDS.descriptionWarn;
  const structure = s.paragraphCount <= 1
    ? SCORE_TUNING.wallOfTextFraction
    : ramp(s.descriptionLength / s.paragraphCount, PARAGRAPH_SIZE_CURVE);

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
      { weight: 0.4, fraction: ramp(s.descriptionLength, DESCRIPTION_LENGTH_CURVE) },
      { weight: 0.2, fraction: ramp(s.tagsInFirst160.length, DESCRIPTION_HEAD_CURVE) },
      { weight: 0.2, fraction: gradeStructure ? structure : null },
      { weight: 0.2, fraction: s.keywordScanFailed ? null : ramp(s.maxKeywordRepeats, STUFFING_CURVE) },
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

  return {
    overall: Math.round((title.score + tags.score + photos.score + description.score) / 4),
    title,
    tags,
    photos,
    description,
  };
}
