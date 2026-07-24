import type { DescriptionSegment } from "./listingDetail";
import styles from "./FlaggedDescription.module.css";

/** Renders the listing description as plain text, except segments the
 *  audit flagged (keyword stuffing, vague phrasing) get a highlighted
 *  underline right where the problem actually is. */
export function FlaggedDescription({ segments }: { segments: DescriptionSegment[] }) {
  return (
    <p className={styles.text}>
      {segments.map((seg, i) =>
        seg.flag ? (
          <mark key={i} className={seg.flag === "bad" ? styles.bad : styles.warn}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}
