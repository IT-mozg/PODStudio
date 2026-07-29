import { NoDataNotice } from "../../shared/components/NoDataNotice";
import type { DescriptionSegment } from "./types";
import styles from "./FlaggedDescription.module.css";

interface FlaggedDescriptionProps {
  /** The listing's real description, straight from Etsy. */
  text: string;
  /** `text` cut along the keyword occurrences seoSignals.ts found — the
   *  segments concatenate back to exactly `text`, so a highlight can never
   *  point at something that isn't there. */
  segments: DescriptionSegment[];
}

/** Renders the real description, highlighting where the listing's own tags
 *  and title keywords actually occur. The color says which of the two a
 *  match came from; how much repetition is too much is the checklist's call
 *  (seoChecks.ts), which counts the same occurrences.
 *
 *  Both the text and the flags used to be invented: the description was a
 *  fixed Ukrainian paragraph and the "problems" were hardcoded offsets into
 *  it, so every listing was reported as keyword-stuffed. Both are real
 *  now (#78 for the text, #85 for the flags). */
export function FlaggedDescription({ text, segments }: FlaggedDescriptionProps) {
  if (!text.trim()) {
    return <NoDataNotice>Etsy не повертає опису для цього лістинга.</NoDataNotice>;
  }

  const highlighted = segments.some((seg) => seg.flag);

  return (
    <>
      {/* `white-space: pre-wrap` in the stylesheet keeps Etsy's own paragraph
          breaks — descriptions are plain text with real newlines in them. */}
      <p className={styles.text}>
        {segments.map((seg, i) =>
          seg.flag ? (
            <mark key={i} className={seg.flag === "tag" ? styles.tag : styles.title}>
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>
      {highlighted ? (
        <div className={styles.legend}>
          <span>
            <span className={`${styles.swatch} ${styles.tagSwatch}`} aria-hidden="true" />
            тег лістинга
          </span>
          <span>
            <span className={`${styles.swatch} ${styles.titleSwatch}`} aria-hidden="true" />
            слово із заголовка
          </span>
        </div>
      ) : null}
    </>
  );
}
