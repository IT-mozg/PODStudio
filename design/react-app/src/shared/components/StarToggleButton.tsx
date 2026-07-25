import { memo, type MouseEvent } from "react";
import { StarIcon } from "../icons";
import styles from "./StarToggleButton.module.css";

interface StarToggleButtonProps {
  active: boolean;
  activeTitle: string;
  inactiveTitle: string;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
}

/** The small square star toggle at the end of a results row — same
 *  look on Лістинги, Магазини, Ключові слова and the listing's tags
 *  table, so a style change never has to be repeated four times.
 *  Owns its own right-aligned cell wrapper, so callers just drop it
 *  straight into a <td>. Memoized because it sits inside table rows —
 *  a table re-render shouldn't repaint every star unless its own
 *  props actually changed. */
export const StarToggleButton = memo(function StarToggleButton({ active, activeTitle, inactiveTitle, onClick }: StarToggleButtonProps) {
  return (
    <div className={styles.actions}>
      <div
        className={active ? `${styles.starBtn} ${styles.starBtnActive}` : styles.starBtn}
        title={active ? activeTitle : inactiveTitle}
        onClick={onClick}
      >
        <StarIcon size={14} />
      </div>
    </div>
  );
});
