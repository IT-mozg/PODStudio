import type { ReactNode } from "react";
import styles from "./NoDataNotice.module.css";

interface NoDataNoticeProps {
  /** What is missing and why, in one sentence. */
  children: ReactNode;
  /** An illustrative rendering of what this block will look like once the
   *  data exists. Shown dimmed, behind an explicit "ПРИКЛАД" ribbon, and
   *  made inert (pointer-events: none + aria-hidden) — it exists so the
   *  intended design isn't lost while the feature waits on its ticket, and
   *  it must never be mistakable for, or interactable as, real data. */
  preview?: ReactNode;
}

/** Body of a section that has no data to show yet — pairs with the
 *  TodoBadge in that section's heading. Says plainly that the feature isn't
 *  wired up, instead of rendering an empty table that reads like "this
 *  listing has no tags". */
export function NoDataNotice({ children, preview }: NoDataNoticeProps) {
  return (
    <div className={styles.notice}>
      <div className={styles.text}>{children}</div>
      {preview && (
        <div className={styles.previewWrap}>
          <div className={styles.ribbon}>Приклад — не реальні дані</div>
          <div className={styles.preview} aria-hidden="true">
            {preview}
          </div>
        </div>
      )}
    </div>
  );
}
