import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

/** Title + subtitle block every page renders under the topbar. */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.title}>{title}</div>
      <div className={styles.subtitle}>{subtitle}</div>
    </div>
  );
}
