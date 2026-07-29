/* Raw SEO measurements taken off a real ListingDetail.
 *
 * This module deliberately produces no verdicts — no "ok", no score, no
 * wording. It only counts what is actually there: how long the title is,
 * which tags repeat, where in the description a keyword literally occurs.
 * Two consumers turn these into judgements: seoChecks.ts (the checklist and
 * the description highlighting, #85) and the Listing Score (#84). Keeping
 * the measurements in one place is what stops those two from disagreeing
 * about the same listing.
 *
 * Everything here is derived from fields Etsy really returns
 * (container.listing_detail_payload): title, tags, description, photos.
 * Nothing is estimated, and nothing needs a network call.
 */

import type { ListingDetail } from "./types";
import { DESCRIPTION_HEAD_CHARS, ETSY_LIMITS, TITLE_HEAD_CHARS } from "./seoLimits";

export { DESCRIPTION_HEAD_CHARS, TITLE_HEAD_CHARS };

/** Words too common to be worth flagging as a title keyword. Etsy titles are
 *  overwhelmingly English; a non-English word simply won't match this list
 *  and stays a candidate, which is the safe direction to err in. */
const STOP_WORDS = new Set([
  "with", "for", "the", "and", "your", "from", "this", "that", "you",
  "our", "are", "all", "not", "but", "can", "has", "have", "was", "were",
  "will", "into", "onto", "over", "out", "off", "any", "its", "his", "her",
  "their", "them", "they", "she", "him", "one", "two", "who", "how", "why",
  "what", "when", "where", "than", "then", "there", "here", "more", "most",
  "some", "such", "only", "also", "just", "very", "much", "many", "each",
  "every", "per", "via", "etc", "gift", "gifts",
]);

export interface KeywordHit {
  /** The keyword as it was searched for (a tag, or a word from the title). */
  keyword: string;
  source: "tag" | "title";
  /** Real positions in the description: [start, end), ascending, never
   *  overlapping another hit's span. Slicing the description by these gives
   *  back exactly the text that was matched. */
  spans: [number, number][];
}

export interface SeoSignals {
  /** The exact description every span in `keywordHits` was measured against.
   *  It travels with the signals so a caller cannot pair offsets with a
   *  different string — the offsets are meaningless against anything else. */
  description: string;
  titleLength: number;
  /** How many characters Etsy's own title cap dropped, 0 when it fit. The
   *  audit measures the truncated title, because that is the one Etsy shows. */
  titleOverLimitBy: number;
  /** The first tag that occurs whole inside the title's opening
   *  TITLE_HEAD_CHARS characters, or null when none does. */
  tagInTitleHead: string | null;
  tagCount: number;
  /** Tags that appear more than once after trimming and lowercasing. */
  duplicateTags: string[];
  singleWordTags: string[];
  /** Pairs where one tag's words are a subset of another's, e.g.
   *  ["floral tee", "floral tee women"] — they compete for the same query. */
  overlappingTags: [string, string][];
  photoCount: number;
  descriptionLength: number;
  /** False for an empty description *and* for one that is only whitespace —
   *  the same test FlaggedDescription uses to show its empty state, so the
   *  checklist can never grade text that the page reports as missing. */
  hasDescription: boolean;
  /** True when the keyword scan could not run (a pattern the engine rejected).
   *  Then an empty `keywordHits` means "not measured", never "nothing found",
   *  and any check reading it must report `unknown` instead of a pass. */
  keywordScanFailed: boolean;
  /** Whether the description has at least one blank line, i.e. real
   *  paragraphs rather than one wall of text. */
  hasParagraphBreaks: boolean;
  /** Tags occurring in the description's opening DESCRIPTION_HEAD_CHARS. */
  tagsInFirst160: string[];
  keywordHits: KeywordHit[];
  /** Occurrences of the single most-repeated keyword. 0 when none matched. */
  maxKeywordRepeats: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A letter or a digit in any script. `\w` and `\b` are ASCII-only even under
 *  the /u flag, and Etsy titles are not: "café", "Löwe" or a Cyrillic tag
 *  would silently lose its edge character to a `\W` trim, and the offsets
 *  built from it would then point at the wrong text. */
const IS_LETTER = /[\p{L}\p{N}]/u;
const EDGE_TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** All positions of `needle` in `haystack`, case-insensitively, respecting
 *  word boundaries where the needle's own edges are letters or digits.
 *  Returns offsets into `haystack` as given — never into a normalized copy,
 *  because the caller slices the original text with them.
 *
 *  `null` means the scan could not run at all, which is not the same answer
 *  as "no occurrences" and must not be reported as one.
 *
 *  The boundary is checked against the neighbouring characters rather than
 *  written into the pattern: `\b` is ASCII-only even under /u (it would cut
 *  "café" short), and the lookbehind that fixes that is unsupported in
 *  Safari before 16.4, where every pattern would throw and the whole audit
 *  would quietly report a clean description. */
function findSpans(haystack: string, needle: string): [number, number][] | null {
  if (!needle) return [];
  let re: RegExp;
  try {
    re = new RegExp(escapeRegExp(needle), "giu");
  } catch {
    // A tag can be any string Etsy accepted; if it somehow defeats the
    // pattern, say so rather than pass an empty result off as a result.
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

/** Pairs of tags where one's word set contains the other's. Both are real
 *  tags of this listing, so the pair is always reportable verbatim. */
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

/** Drops any span that overlaps one already kept. Longer keywords win, so
 *  "vintage cat shirt" is highlighted as a phrase instead of being cut up by
 *  the shorter "cat" that sits inside it. */
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

/** Exactly the fields the audit reads. Narrower than ListingDetail on
 *  purpose: the caller can then memoize on these four instead of on the
 *  whole listing, which changes identity on every unrelated update (a
 *  "track" toggle, say). */
export type SeoInput = Pick<ListingDetail, "title" | "tags" | "description" | "photos">;

/** Every measurement the SEO checklist (#85) and the Listing Score (#84)
 *  are built from. Pure: same fields in, same signals out. */
export function buildSeoSignals(listing: SeoInput): SeoSignals {
  const rawTitle = listing.title ?? "";
  // Etsy cuts the title at its cap, so the audit measures what Etsy actually
  // shows. Anything past the cap is counted separately, not silently kept.
  const title = rawTitle.slice(0, ETSY_LIMITS.titleChars);
  const titleOverLimitBy = rawTitle.length - title.length;
  const description = listing.description ?? "";

  // One flag for the whole scan: a pattern the engine rejects makes every
  // keyword result untrustworthy, not just that keyword's.
  let keywordScanFailed = false;
  const spansOf = (haystack: string, needle: string): [number, number][] => {
    const found = findSpans(haystack, needle);
    if (found === null) {
      keywordScanFailed = true;
      return [];
    }
    return found;
  };
  // Trimmed once, up front: everything below both searches with and reports
  // the same string, so a tag stored with stray spaces can't show up padded
  // in the checklist while matching unpadded in the text.
  const tags = (listing.tags ?? []).map((tag) => tag.trim()).filter(Boolean);

  const titleHead = title.slice(0, TITLE_HEAD_CHARS);
  const tagInTitleHead = tags.find((tag) => spansOf(titleHead, tag).length > 0) ?? null;

  const descriptionHead = description.slice(0, DESCRIPTION_HEAD_CHARS);
  const tagsInFirst160 = tags.filter((tag) => spansOf(descriptionHead, tag).length > 0);

  const tagHits: KeywordHit[] = tags
    .map((tag): KeywordHit => ({ keyword: tag, source: "tag", spans: spansOf(description, tag) }))
    .filter((hit) => hit.spans.length > 0);

  // Title keywords are only interesting where a tag doesn't already cover
  // them — otherwise the same word would be reported from two sources.
  const tagWords = new Set(tags.flatMap((tag) => words(normalizeTag(tag))));
  const titleWords = [...new Set(words(title.toLowerCase()).map((word) => word.replace(EDGE_TRIM, "")))];
  const titleHits: KeywordHit[] = titleWords
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word) && !tagWords.has(word))
    .map((word): KeywordHit => ({ keyword: word, source: "title", spans: spansOf(description, word) }))
    .filter((hit) => hit.spans.length > 0);

  const keywordHits = resolveOverlaps([...tagHits, ...titleHits]);

  return {
    description,
    titleLength: title.length,
    titleOverLimitBy,
    tagInTitleHead,
    tagCount: tags.length,
    duplicateTags: findDuplicates(tags),
    singleWordTags: tags.filter((tag) => words(normalizeTag(tag)).length === 1),
    overlappingTags: findOverlaps(tags),
    photoCount: (listing.photos ?? []).length,
    descriptionLength: description.length,
    hasDescription: description.trim().length > 0,
    keywordScanFailed,
    hasParagraphBreaks: /\n\s*\n/.test(description),
    tagsInFirst160,
    keywordHits,
    maxKeywordRepeats: keywordHits.reduce((max, hit) => Math.max(max, hit.spans.length), 0),
  };
}
