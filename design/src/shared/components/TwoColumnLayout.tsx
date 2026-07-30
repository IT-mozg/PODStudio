import type { ReactNode } from "react";
import styles from "./TwoColumnLayout.module.css";

/** grid-template-columns for the default ~63/37 content-to-sidebar split. */
const DEFAULT_RATIO = "1.7fr 1fr";

interface TwoColumnLayoutProps {
  children: ReactNode;
  aside: ReactNode;
  /** Any grid-template-columns value. */
  ratio?: string;
}

/** Shared by both detail pages, so spacing and the collapse breakpoint live
 *  in one module.css instead of two that drift. */
export function TwoColumnLayout({ children, aside, ratio = DEFAULT_RATIO }: TwoColumnLayoutProps) {
  return (
    <div className={styles.twoCol} style={{ gridTemplateColumns: ratio }}>
      <div className={styles.col}>{children}</div>
      <div className={styles.col}>{aside}</div>
    </div>
  );
}
