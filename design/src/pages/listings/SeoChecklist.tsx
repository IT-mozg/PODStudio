import type { SeoCheckItem, SeoCheckStatus } from "./listingDetail";
import styles from "./SeoChecklist.module.css";

const ICON: Record<SeoCheckStatus, string> = { ok: "✓", warn: "~", bad: "!" };

export function SeoChecklist({ checks }: { checks: SeoCheckItem[] }) {
  return (
    <div className={styles.list}>
      {checks.map((check, i) => (
        <div className={styles.row} key={i}>
          <div className={`${styles.icon} ${styles[check.status]}`}>{ICON[check.status]}</div>
          <div>
            <div className={styles.title}>{check.title}</div>
            <div className={styles.detail}>{check.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
