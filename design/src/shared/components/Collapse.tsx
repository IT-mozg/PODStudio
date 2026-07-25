import type { ReactNode } from "react";
import styles from "./Collapse.module.css";

interface CollapseProps {
  isOpen: boolean;
  children: ReactNode;
}

/** Animated expand/collapse for content whose height isn't known ahead
 *  of time — no JS height measurement, just the CSS grid-template-rows
 *  0fr → 1fr trick. The child stays mounted (grid row collapses to 0),
 *  so any AnimatedNumber inside keeps ticking correctly when reopened. */
export function Collapse({ isOpen, children }: CollapseProps) {
  return (
    <div className={isOpen ? `${styles.collapse} ${styles.open}` : styles.collapse}>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
