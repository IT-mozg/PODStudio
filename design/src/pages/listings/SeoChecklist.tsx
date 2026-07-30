import { TodoBadge } from "../../shared/components/TodoBadge";
import { InfoHint } from "../../shared/components/InfoHint";
import type { SeoCheckItem, SeoCheckStatus } from "./types";
import styles from "./SeoChecklist.module.css";

const ICON: Record<SeoCheckStatus, string> = { ok: "✓", warn: "~", bad: "!", unknown: "—" };

/** For screen readers, which get neither the glyph nor the color. */
const STATUS_LABEL: Record<SeoCheckStatus, string> = {
  ok: "Гаразд:",
  warn: "Попередження:",
  bad: "Проблема:",
  unknown: "Немає даних:",
};

/** Every row comes from a real field (seoChecks.ts). The previous version
 *  generated them with a PRNG, so "keyword stuffing" was reported on every
 *  listing regardless of its description.
 *
 *  A check with no data source arrives as `unknown` and is greyed out rather
 *  than dropped, so it's clear it exists and why it has no answer. */
export function SeoChecklist({ checks }: { checks: SeoCheckItem[] }) {
  return (
    <div className={styles.list}>
      {/* Keyed by title, not index: each row owns an InfoHint with its own
          open state, and an index key would hand a pinned hint to whatever
          check lands at that position on the next listing. */}
      {checks.map((check) => (
        <div className={`${styles.row} ${check.status === "unknown" ? styles.muted : ""}`} key={check.title}>
          <div className={`${styles.icon} ${styles[check.status]}`} aria-hidden="true">
            {ICON[check.status]}
          </div>
          <div className={styles.body}>
            <div className={styles.title}>
              <span className={styles.srOnly}>{STATUS_LABEL[check.status]}</span>
              <span className={styles.titleText}>{check.title}</span>
              {check.todoIssue ? <TodoBadge issue={check.todoIssue} reason={check.why} /> : null}
              <span className={styles.hint}>
                <InfoHint text={check.why} label={`Чому це важливо: ${check.title}`} />
              </span>
            </div>
            <div className={styles.detail}>{check.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
