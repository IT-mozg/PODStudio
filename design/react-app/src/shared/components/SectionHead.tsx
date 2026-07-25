import type { ComponentType } from "react";
import styles from "./SectionHead.module.css";

interface SectionHeadProps {
  icon: ComponentType<{ size?: number }>;
  title: string;
  linkText?: string;
}

export function SectionHead({ icon: Icon, title, linkText }: SectionHeadProps) {
  return (
    <div className={styles.head}>
      <div className={styles.title}>
        <Icon size={16} />
        <span>{title}</span>
      </div>
      {linkText && <span className={styles.link}>{linkText}</span>}
    </div>
  );
}
