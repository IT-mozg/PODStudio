/* Raw SEO measurements off a real ListingDetail — counts only, no verdicts.
 * seoChecks.ts (#85) and the Listing Score (#84) both judge from these, which
 * is what stops them disagreeing about the same listing. */

import type { ListingDetail } from "./types";
import { DESCRIPTION_HEAD_CHARS, ETSY_LIMITS, TITLE_HEAD_CHARS } from "./seoLimits";

export { DESCRIPTION_HEAD_CHARS, TITLE_HEAD_CHARS };

/** Too common to flag as a title keyword. A non-English word won't match and
 *  stays a candidate — the safe direction to err in. */
const STOP_WORDS = new Set([
  "with", "for", "the", "and", "your", "from", "this", "that", "you",
  "our", "are", "all", "not", "but", "can", "has", "have", "was", "were",
  "will", "into", "onto", "over", "out", "off", "any", "its", "his", "her",
  "their", "them", "they", "she", "him", "one", "two", "who", "how", "why",
  "what", "when", "where", "than", "then", "there", "here", "more", "most",
  "some", "such", "only", "also", "just", "very", "much", "many", "each",
  "every", "per", "via", "etc", "gift", "gifts",
]);

/** Shorter title words carry no search intent on their own. */
const MIN_TITLE_KEYWORD_CHARS = 4;

export interface KeywordHit {
  keyword: string;
  source: "tag" | "title";
  /** [start, end) in the description, ascending and never overlapping. */
  spans: [number, number][];
}

export interface SeoSignals {
  /** Travels with the spans so a caller can't pair offsets with a different
   *  string. */
  description: string;
  titleLength: number;
  /** Characters Etsy's cap dropped, 0 when it fit. Everything else measures
   *  the truncated title — the one Etsy shows. */
  titleOverLimitBy: number;
  /** Where the earliest tag starts in the title, `null` when none occurs.
   *  Score and checklist both read this one number, so they can't disagree. */
  tagTitleOffset: number | null;
  tagInTitleHead: string | null;
  tagCount: number;
  duplicateTags: string[];
  singleWordTags: string[];
  /** Tag slots spent on nothing: a repeat, a lone word, or the swallowed half
   *  of an overlapping pair. Slots, not names — a tag used twice wastes one
   *  and keeps the other, which a set of names cannot express. */
  weakTags: string[];
  /** One tag's words a subset of another's — ["floral tee", "floral tee
   *  women"] compete for the same query. */
  overlappingTags: [string, string][];
  photoCount: number;
  descriptionLength: number;
  /** False for whitespace-only too, matching FlaggedDescription's test. */
  hasDescription: boolean;
  /** Then an empty `keywordHits` means "not measured", never "nothing found",
   *  and a check reading it must report `unknown` rather than a pass. */
  keywordScanFailed: boolean;
  hasParagraphBreaks: boolean;
  /** Non-empty paragraphs: 0 for no description, 1 for a wall of text.
   *  `hasParagraphBreaks` derives from this, it isn't a second test. */
  paragraphCount: number;
  tagsInFirst160: string[];
  keywordHits: KeywordHit[];
  /** Occurrences of the most-repeated keyword, 0 when none matched. */
  maxKeywordRepeats: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `\w`/`\b` are ASCII-only even under /u, and Etsy titles are not — "café"
 *  would lose its last letter and the offsets would point at the wrong text. */
const IS_LETTER = /[\p{L}\p{N}]/u;
const EDGE_TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Every position of `needle` in `haystack`. `null` = the scan could not run,
 *  which is not "no occurrences" and must not be reported as one.
 *
 *  Boundaries are tested against neighbouring characters instead of written
 *  into the pattern: a lookbehind throws in Safari before 16.4, and every
 *  keyword failing there would quietly pass the description as clean. */
function findSpans(haystack: string, needle: string): [number, number][] | null {
  if (!needle) return [];
  let re: RegExp;
  try {
    re = new RegExp(escapeRegExp(needle), "giu");
  } catch {
    // Say so rather than pass an empty result off as a result.
    return null;
  }

  const needsLeftBoundary = IS_LETTER.test(needle[0]);
  const needsRightBoundary = IS_LETTER.test(needle[needle.length - 1]);
  const spans: [number, number][] = [];

  for (const match of haystack.matchAll(re)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (needsLeftBoundary && start > 0 && IS_LETTER.test(haystack[start - 1])) continue;
    if (needsRightBoundary && end < haystack.length && IS_LETTER.test(haystack[end])) continue;
    spans.push([start, end]);
  }
  return spans;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function words(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function findDuplicates(tags: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const tag of tags) {
    const key = normalizeTag(tag);
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}

/** Pairs where one tag's word set contains the other's. */
function findOverlaps(tags: string[]): [string, string][] {
  const parsed = tags.map((tag) => ({ tag, set: new Set(words(normalizeTag(tag))) }));
  const pairs: [string, string][] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const a = parsed[i];
      const b = parsed[j];
      if (!a.set.size || !b.set.size || a.set.size === b.set.size) continue;
      const [small, large] = a.set.size < b.set.size ? [a, b] : [b, a];
      if ([...small.set].every((word) => large.set.has(word))) {
        pairs.push([small.tag, large.tag]);
      }
    }
  }
  return pairs;
}

/** Drops spans overlapping one already kept. Longer keywords win, so
 *  "vintage cat shirt" stays a phrase instead of being cut up by "cat". */
function resolveOverlaps(hits: KeywordHit[]): KeywordHit[] {
  const ordered = [...hits].sort((a, b) => b.keyword.length - a.keyword.length);
  const taken: [number, number][] = [];
  const kept: KeywordHit[] = [];

  for (const hit of ordered) {
    const spans = hit.spans.filter(([start, end]) =>
      !taken.some(([tStart, tEnd]) => start < tEnd && end > tStart),
    );
    if (!spans.length) continue;
    taken.push(...spans);
    kept.push({ ...hit, spans });
  }

  return kept.sort((a, b) => a.spans[0][0] - b.spans[0][0]);
}

/** Only the fields the audit reads, so callers memoize on these four rather
 *  than on a listing that changes identity on every unrelated update. */
export type SeoInput = Pick<ListingDetail, "title" | "tags" | "description" | "photos">;

export function buildSeoSignals(listing: SeoInput): SeoSignals {
  const rawTitle = listing.title ?? "";
  // Etsy cuts the title at its cap, so measure what Etsy shows.
  const title = rawTitle.slice(0, ETSY_LIMITS.titleChars);
  const titleOverLimitBy = rawTitle.length - title.length;
  const description = listing.description ?? "";

  // One flag for the whole scan: a rejected pattern makes every keyword
  // result untrustworthy, not just its own.
  let keywordScanFailed = false;
  const spansOf = (haystack: string, needle: string): [number, number][] => {
    const found = findSpans(haystack, needle);
    if (found === null) {
      keywordScanFailed = true;
      return [];
    }
    return found;
  };
  // Trimmed once so a padded tag can't be searched for one way and reported
  // another.
  const tags = (listing.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  // The whole title, not a sliced-off head: the slice put a string end
  // mid-title, where a truncated tag has no right-hand neighbour to fail the
  // boundary test and matched something it wasn't.
  let tagTitleOffset: number | null = null;
  let earliestTag: string | null = null;
  for (const tag of tags) {
    const spans = spansOf(title, tag);
    if (!spans.length) continue;
    const start = spans[0][0];
    if (tagTitleOffset === null || start < tagTitleOffset) {
      tagTitleOffset = start;
      earliestTag = tag;
    }
  }
  const tagInTitleHead = tagTitleOffset !== null && tagTitleOffset < TITLE_HEAD_CHARS ? earliestTag : null;

  const descriptionHead = description.slice(0, DESCRIPTION_HEAD_CHARS);
  const tagsInFirst160 = tags.filter((tag) => spansOf(descriptionHead, tag).length > 0);

  const tagHits: KeywordHit[] = tags
    .map((tag): KeywordHit => ({ keyword: tag, source: "tag", spans: spansOf(description, tag) }))
    .filter((hit) => hit.spans.length > 0);

  // Skip words a tag already covers, or they'd be reported from two sources.
  const tagWords = new Set(tags.flatMap((tag) => words(normalizeTag(tag))));
  const titleWords = [...new Set(words(title.toLowerCase()).map((word) => word.replace(EDGE_TRIM, "")))];
  const titleHits: KeywordHit[] = titleWords
    .filter((word) => word.length >= MIN_TITLE_KEYWORD_CHARS && !STOP_WORDS.has(word) && !tagWords.has(word))
    .map((word): KeywordHit => ({ keyword: word, source: "title", spans: spansOf(description, word) }))
    .filter((hit) => hit.spans.length > 0);

  const keywordHits = resolveOverlaps([...tagHits, ...titleHits]);

  // In slot order: the first use of a name works, every later one is wasted.
  const overlappingTags = findOverlaps(tags);
  const swallowed = new Set(overlappingTags.map(([small]) => normalizeTag(small)));
  const seenTags = new Set<string>();
  const weakTags = tags.filter((tag) => {
    const key = normalizeTag(tag);
    const isRepeat = seenTags.has(key);
    seenTags.add(key);
    return isRepeat || words(key).length === 1 || swallowed.has(key);
  });

  const paragraphCount = description
    .split(/\n\s*\n/)
    .filter((part) => part.trim().length > 0).length;

  return {
    description,
    titleLength: title.length,
    titleOverLimitBy,
    tagTitleOffset,
    tagInTitleHead,
    tagCount: tags.length,
    duplicateTags: findDuplicates(tags),
    singleWordTags: tags.filter((tag) => words(normalizeTag(tag)).length === 1),
    weakTags,
    overlappingTags,
    photoCount: (listing.photos ?? []).length,
    descriptionLength: description.length,
    hasDescription: description.trim().length > 0,
    keywordScanFailed,
    // Off paragraphCount, so a trailing blank line can't make the checklist
    // call a wall of text "split into paragraphs".
    hasParagraphBreaks: paragraphCount > 1,
    paragraphCount,
    tagsInFirst160,
    keywordHits,
    maxKeywordRepeats: keywordHits.reduce((max, hit) => Math.max(max, hit.spans.length), 0),
  };
}
