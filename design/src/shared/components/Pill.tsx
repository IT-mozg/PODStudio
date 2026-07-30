import { memo, type ReactNode } from "react";
import styles from "./Pill.module.css";

interface PillProps {
  children: ReactNode;
  /** "sm" for a tag chip in a table cell, "md" standalone. */
  size?: "sm" | "md";
}

/** Memoized: rendered in bulk inside table rows. */
export const Pill = memo(function Pill({ children, size = "md" }: PillProps) {
  return <span className={size === "sm" ? `${styles.pill} ${styles.sm}` : styles.pill}>{children}</span>;
});
