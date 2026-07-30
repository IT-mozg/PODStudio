/* Every tunable number the SEO audit and the Listing Score use. Etsy moves
 * these — the photo cap was 10 and is 20 now — so this file is the only edit
 * needed: the checks build their wording from these values and can't drift.
 *
 * Only ETSY_LIMITS are Etsy's. Everything else is this project's judgement. */

export const ETSY_LIMITS = {
  titleChars: 140,
  tags: 13,
  photos: 20,
} as const;

/** Inclusive lower bounds: `titleOk: 100` means "100 characters or more". */
const RAW_THRESHOLDS = {
  titleOk: 100,
  titleWarn: 60,
  /** A full set of tags is always ok, so there is no tagsOk. */
  tagsWarn: 10,
  photosOk: 7,
  photosWarn: 5,
  descriptionOk: 1000,
  descriptionWarn: 300,
  /** Occurrences of one keyword in the description. */
  stuffingBad: 5,
  stuffingWarn: 3,
} as const;

/** Where Etsy's own search result stops showing the title. Used for "is a
 *  keyword up front", not as a length verdict. */
export const TITLE_HEAD_CHARS = 60;

/** Roughly what Google lifts as the listing page's meta description. */
export const DESCRIPTION_HEAD_CHARS = 160;

/** Keeps a threshold reachable — photosOk of 7 against a cap of 5 would mean
 *  no listing can ever pass. */
function clamp(value: number, cap: number): number {
  return Math.max(1, Math.min(value, cap));
}

/** Tunables only the Listing Score uses: these bend a curve rather than flip a
 *  verdict, so they sit apart from the thresholds. */
export const SCORE_TUNING = {
  /** Overflow, as a share of the title cap, at which length has lost most of
   *  its value. */
  titleOverflowPenaltyAt: 0.25,
  /** What a title keeps when no tag occurs in it — placement can scale the
   *  length score, not rescue an unused title. */
  titlePlacementFloor: 0.6,
  /** Tags in the description's head that count as a full result. */
  headTagsTarget: 3,
  /** Characters per paragraph still comfortable on a phone. */
  comfortableParagraphChars: 500,
  /** Past this it's a wall of text whatever the writing is like. */
  unreadableParagraphChars: 1500,
  /** What a description with no paragraph break keeps. Applied on top of the
   *  size curve, not instead of it: the fault is the missing break, but how
   *  bad it is still depends on the length. */
  singleParagraphFraction: 0.7,
  /** Multiple of descriptionOk that earns the full length score. */
  descriptionFullCreditAt: 2,
  /** Multiple of stuffingBad at which repetition scores nothing. */
  stuffingZeroAt: 2,
} as const;

export const SEO_THRESHOLDS = {
  ...RAW_THRESHOLDS,
  titleOk: clamp(RAW_THRESHOLDS.titleOk, ETSY_LIMITS.titleChars),
  titleWarn: clamp(Math.min(RAW_THRESHOLDS.titleWarn, RAW_THRESHOLDS.titleOk), ETSY_LIMITS.titleChars),
  tagsWarn: clamp(RAW_THRESHOLDS.tagsWarn, ETSY_LIMITS.tags),
  photosOk: clamp(RAW_THRESHOLDS.photosOk, ETSY_LIMITS.photos),
  photosWarn: clamp(Math.min(RAW_THRESHOLDS.photosWarn, RAW_THRESHOLDS.photosOk), ETSY_LIMITS.photos),
} as const;
