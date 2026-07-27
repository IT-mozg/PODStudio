import type { ComponentType, ReactNode } from "react";
import styles from "./SectionHead.module.css";

interface SectionHeadProps {
  icon: ComponentType<{ size?: number }>;
  title: string;
  linkText?: string;
  /** Rendered right after the title — a TodoBadge, when the section has no
   *  real data behind it yet. */
  badge?: ReactNode;
}

export function SectionHead({ icon: Icon, title, linkText, badge }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.title}>
        <Icon size={16} />
        <span>{title}</span>
        {badge}
      </div>
      {linkText && <span className={styles.link}>{linkText}</span>}
    </div>
  );
}
