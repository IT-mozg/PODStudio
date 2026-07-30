import { memo, type MouseEvent } from "react";
import { StarIcon } from "../icons";
import styles from "./StarToggleButton.module.css";

interface StarToggleButtonProps {
  active: boolean;
  activeTitle: string;
  inactiveTitle: string;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
}

/** Star toggle at the end of a results row. Owns its right-aligned cell
 *  wrapper, so callers drop it straight into a <td>. Memoized: a table
 *  re-render shouldn't repaint every star. */
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
