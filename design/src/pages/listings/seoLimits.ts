/* Every tunable number the SEO audit uses. Etsy moves these — the photo cap
 * was 10 and is 20 now — so this file is meant to be the only edit: the
 * checks build their wording from these values and can't drift out of sync.
 *
 * Only the caps are Etsy's; the thresholds are this project's judgement call. */

/** Hard caps Etsy itself enforces. */
export const ETSY_LIMITS = {
  titleChars: 140,
  tags: 13,
  photos: 20,
} as const;

/** Where each check flips between ok / warn / bad. Values are inclusive
 *  lower bounds: `titleOk: 100` means "100 characters or more is ok". */
const RAW_THRESHOLDS = {
  /** Title length. Below `titleWarn` is bad. */
  titleOk: 100,
  titleWarn: 60,
  /** Tag count. Below `tagsWarn` is bad; a full set is always ok. */
  tagsWarn: 10,
  /** Photo count. Below `photosWarn` is bad. */
  photosOk: 7,
  photosWarn: 5,
  /** Description length in characters. Below `descriptionWarn` is bad. */
  descriptionOk: 1000,
  descriptionWarn: 300,
  /** Occurrences of one keyword in the description. */
  stuffingBad: 5,
  stuffingWarn: 3,
} as const;

/** How far into the title Etsy's own search result stops showing text. Used
 *  for "is a keyword up front", not as a length verdict. */
export const TITLE_HEAD_CHARS = 60;

/** Google lifts roughly this much of the description as the meta description
 *  of the listing page. */
export const DESCRIPTION_HEAD_CHARS = 160;

/** Keeps a threshold reachable — a photosOk of 7 against a cap of 5 would
 *  mean no listing can ever pass. */
function clamp(value: number, cap: number): number {
  return Math.max(1, Math.min(value, cap));
}

/** Tunables the Listing Score (#84) needs and the checklist has no opinion on.
 *  Unlike the thresholds above, these bend a curve rather than flip a verdict,
 *  so they live apart — but still here, not inline in listingScore.ts. */
export const SCORE_TUNING = {
  /** Overflow, as a share of the title cap, at which the length score has
   *  lost most of its value. */
  titleOverflowPenaltyAt: 0.25,
  /** What a title keeps when no tag occurs in it at all. Placement scales the
   *  length score between this and 1 — it can't rescue an unused title. */
  titlePlacementFloor: 0.6,
  /** Tags in the description's head that count as a full result. */
  headTagsTarget: 3,
  /** A paragraph this long still reads comfortably on a phone. */
  comfortableParagraphChars: 500,
  /** Past this, it's a wall of text whatever the writing is like. */
  unreadableParagraphChars: 1500,
  /** What a single-paragraph description keeps of the structure weight. */
  wallOfTextFraction: 0.15,
} as const;

export const SEO_THRESHOLDS = {
  ...RAW_THRESHOLDS,
  titleOk: clamp(RAW_THRESHOLDS.titleOk, ETSY_LIMITS.titleChars),
  titleWarn: clamp(Math.min(RAW_THRESHOLDS.titleWarn, RAW_THRESHOLDS.titleOk), ETSY_LIMITS.titleChars),
  tagsWarn: clamp(RAW_THRESHOLDS.tagsWarn, ETSY_LIMITS.tags),
  photosOk: clamp(RAW_THRESHOLDS.photosOk, ETSY_LIMITS.photos),
  photosWarn: clamp(Math.min(RAW_THRESHOLDS.photosWarn, RAW_THRESHOLDS.photosOk), ETSY_LIMITS.photos),
} as const;
