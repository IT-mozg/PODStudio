import { memo, type ReactNode } from "react";
import styles from "./Pill.module.css";

interface PillProps {
  children: ReactNode;
  /** "sm" for a tag chip packed into a table cell, "md" for a
   *  standalone niche/category label. */
  size?: "sm" | "md";
}

/** The violet accent pill used for niche and tag labels across
 *  Магазини, Лістинги and their detail pages. Renders in bulk inside
 *  table rows, so it's memoized. */
export const Pill = memo(function Pill({ children, size = "md" }: PillProps) {
  return <span className={size === "sm" ? `${styles.pill} ${styles.sm}` : styles.pill}>{children}</span>;
});
