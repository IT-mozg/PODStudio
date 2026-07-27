import { NoDataNotice } from "../../shared/components/NoDataNotice";
import type { DescriptionSegment } from "./types";
import styles from "./FlaggedDescription.module.css";

interface FlaggedDescriptionProps {
  /** The listing's real description, straight from Etsy. */
  text: string;
  /** Problem spans within `text`, once the SEO audit can find them (#85).
   *  `null` means "not analysed", which is today's state — the text renders
   *  plain. It must never mean "analysed and clean". */
  segments: DescriptionSegment[] | null;
}

/** Renders the listing description as plain text, except segments the
 *  audit flagged (keyword stuffing, vague phrasing) get a highlighted
 *  underline right where the problem actually is.
 *
 *  Both the text and the flags used to be invented: the description was a
 *  fixed Ukrainian paragraph and the "problems" were hardcoded offsets into
 *  it, so every listing was reported as keyword-stuffed. The text is real
 *  now; the flagging is #85. */
export function FlaggedDescription({ text, segments }: FlaggedDescriptionProps) {
  if (!text.trim()) {
    return <NoDataNotice>Etsy не повертає опису для цього лістинга.</NoDataNotice>;
  }

  if (!segments) {
    // `white-space: pre-wrap` in the stylesheet keeps Etsy's own paragraph
    // breaks — descriptions are plain text with real newlines in them.
    return <p className={styles.text}>{text}</p>;
  }

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
