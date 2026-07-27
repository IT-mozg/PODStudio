import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { PREVIEW_SEO_CHECKS } from "./previewData";
import type { SeoCheckItem, SeoCheckStatus } from "./types";
import styles from "./SeoChecklist.module.css";

const ICON: Record<SeoCheckStatus, string> = { ok: "✓", warn: "~", bad: "!" };

/** Empty until #85 derives the checks from real fields. The previous version
 *  generated them with a PRNG, so "Keyword stuffing в описі" was reported on
 *  every listing regardless of what its description actually said. */
export function SeoChecklist({ checks }: { checks: SeoCheckItem[] }) {
  if (!checks.length) {
    return (
      <NoDataNotice preview={<SeoChecklist checks={PREVIEW_SEO_CHECKS} />}>
        Перевірки ще не підключено. Кожен пункт у прикладі нижче навмисно
        такий, який справді можна порахувати з наявних полів — довжини
        заголовка, кількості тегів і фото, повторів тегів в описі.
      </NoDataNotice>
    );
  }

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
