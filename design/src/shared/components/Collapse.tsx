import type { ReactNode } from "react";
import styles from "./Collapse.module.css";

interface CollapseProps {
  isOpen: boolean;
  children: ReactNode;
}

/** Expand/collapse without measuring height: the CSS grid-template-rows
 *  0fr → 1fr trick. The child stays mounted, so an AnimatedNumber inside
 *  keeps ticking when reopened. */
export function Collapse({ isOpen, children }: CollapseProps) {
  return (
    <div className={isOpen ? `${styles.collapse} ${styles.open}` : styles.collapse}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
