import type { ReactNode } from "react";
import styles from "./TwoColumnLayout.module.css";

interface TwoColumnLayoutProps {
  /** Main content — the wider column. */
  children: ReactNode;
  /** Sidebar content — the narrower column. */
  aside: ReactNode;
  /** grid-template-columns value; defaults to a ~63/37 split. */
  ratio?: string;
}

/** The "content + sidebar" grid used on both Магазин and Лістинг
 *  detail pages — one layout to tweak (spacing, collapse breakpoint)
 *  instead of two module.css files quietly drifting apart. */
export function TwoColumnLayout({ children, aside, ratio = "1.7fr 1fr" }: TwoColumnLayoutProps) {
  return (
    <div className={styles.twoCol} style={{ gridTemplateColumns: ratio }}>
      <div>{children}</div>
      <div>{aside}</div>
    </div>
  );
}
