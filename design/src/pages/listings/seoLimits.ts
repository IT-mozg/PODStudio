/* Every tunable number the SEO audit uses, in one place.
 *
 * WHY THIS FILE EXISTS: Etsy moves these. The photo cap was 10 when the audit
 * was written and is 20 now; if the tag or title cap moves next, this file is
 * the only edit — the checks build their wording from these values, so no
 * message can drift out of sync with the rule that produced it.
 *
 * HOW TO EDIT SAFELY:
 *   - change a number in ETSY_LIMITS or RAW_THRESHOLDS and nothing else;
 *   - the thresholds are clamped to the caps below, so a threshold left above
 *     a lowered cap degrades to "at the cap" instead of becoming unreachable
 *     (a photosOk of 7 against a cap of 5 would otherwise mean no listing can
 *     ever pass);
 *   - nothing here is a fact Etsy publishes about *quality* — only the caps
 *     are Etsy's. The thresholds are this project's judgement call.
 */

/** Hard caps Etsy itself enforces. */
export const ETSY_LIMITS = {
  /** Listing titles are cut at this length. */
  titleChars: 140,
  /** Tag slots per listing. */
  tags: 13,
  /** Photos per listing. */
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

/** Keeps a threshold reachable: it can never sit above the cap it measures
 *  against, and never below 1. */
function clamp(value: number, cap: number): number {
  return Math.max(1, Math.min(value, cap));
}

export const SEO_THRESHOLDS = {
  ...RAW_THRESHOLDS,
  titleOk: clamp(RAW_THRESHOLDS.titleOk, ETSY_LIMITS.titleChars),
  titleWarn: clamp(Math.min(RAW_THRESHOLDS.titleWarn, RAW_THRESHOLDS.titleOk), ETSY_LIMITS.titleChars),
  tagsWarn: clamp(RAW_THRESHOLDS.tagsWarn, ETSY_LIMITS.tags),
  photosOk: clamp(RAW_THRESHOLDS.photosOk, ETSY_LIMITS.photos),
  photosWarn: clamp(Math.min(RAW_THRESHOLDS.photosWarn, RAW_THRESHOLDS.photosOk), ETSY_LIMITS.photos),
} as const;
