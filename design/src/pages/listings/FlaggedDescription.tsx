import { NoDataNotice } from "../../shared/components/NoDataNotice";
import type { DescriptionSegment } from "./types";
import styles from "./FlaggedDescription.module.css";

interface FlaggedDescriptionProps {
  /** Straight from Etsy. */
  text: string;
  /** `text` cut along the keyword occurrences. The segments concatenate back
   *  to exactly `text`, so a highlight can't point at what isn't there. */
  segments: DescriptionSegment[];
}

/** Highlights where the listing's own tags and title keywords occur. Colour
 *  says which of the two matched; whether it's too much is the checklist's
 *  call. Both text and flags used to be invented, so every listing read as
 *  keyword-stuffed (#78, #85). */
export function FlaggedDescription({ text, segments }: FlaggedDescriptionProps) {
  if (!text.trim()) {
    return <NoDataNotice>Etsy не повертає опису для цього лістинга.</NoDataNotice>;
  }

  const highlighted = segments.some((seg) => seg.flag);

  return (
    <>
      {/* `white-space: pre-wrap` keeps Etsy's own paragraph breaks. */}
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
