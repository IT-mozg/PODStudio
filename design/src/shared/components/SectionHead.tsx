import type { ComponentType, ReactNode } from "react";
import styles from "./SectionHead.module.css";

interface SectionHeadProps {
  icon: ComponentType<{ size?: number }>;
  title: string;
  linkText?: string;
  /** What the linkText actually does. Optional only because the dashboard's
   *  three headings have carried a decorative "Усі →" since before there
   *  were pages to send it to; anything new should wire this. */
  onLinkClick?: () => void;
  /** Rendered right after the title — a TodoBadge, when the section has no
   *  real data behind it yet. */
  badge?: ReactNode;
}

export function SectionHead({ icon: Icon, title, linkText, onLinkClick, badge }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.title}>
        <Icon size={16} />
        <span>{title}</span>
        {badge}
      </div>
      {linkText && (
        <span className={styles.link} onClick={onLinkClick}>
          {linkText}
        </span>
      )}
    </div>
  );
}
