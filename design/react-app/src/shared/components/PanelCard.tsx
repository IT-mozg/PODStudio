import type { ReactNode } from "react";
import styles from "./PanelCard.module.css";

interface PanelCardProps {
  padded?: boolean;
  children: ReactNode;
}

/** Generic card shell — dashboard panels and the shops tracked list both use it. */
export function PanelCard({ padded, children }: PanelCardProps) {
  return <div className={padded ? `${styles.panelCard} ${styles.padded}` : styles.panelCard}>{children}</div>;
}
