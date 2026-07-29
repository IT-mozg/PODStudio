import { TodoBadge } from "../../shared/components/TodoBadge";
import { InfoHint } from "../../shared/components/InfoHint";
import type { SeoCheckItem, SeoCheckStatus } from "./types";
import styles from "./SeoChecklist.module.css";

const ICON: Record<SeoCheckStatus, string> = { ok: "✓", warn: "~", bad: "!", unknown: "—" };

/** Repeated as text for screen readers, which get neither the glyph nor the
 *  color. */
const STATUS_LABEL: Record<SeoCheckStatus, string> = {
  ok: "Гаразд:",
  warn: "Попередження:",
  bad: "Проблема:",
  unknown: "Немає даних:",
};

/** Every row is derived from a real field of the listing (seoChecks.ts on top
 *  of seoSignals.ts) — #85. The version before that generated the rows with a
 *  PRNG, so "keyword stuffing" was reported on every listing regardless of
 *  what its description actually said.
 *
 *  A check whose data source doesn't exist yet arrives as `unknown` with the
 *  ticket that will fill it in — it is shown greyed out rather than dropped,
 *  so it is clear the check exists and why it has no answer. */
export function SeoChecklist({ checks }: { checks: SeoCheckItem[] }) {
  return (
    <div className={styles.list}>
      {checks.map((check, i) => (
        <div className={`${styles.row} ${check.status === "unknown" ? styles.muted : ""}`} key={i}>
          <div className={`${styles.icon} ${styles[check.status]}`} aria-hidden="true">
            {ICON[check.status]}
          </div>
          <div>
            <div className={styles.title}>
              <span className={styles.srOnly}>{STATUS_LABEL[check.status]}</span>
              <span>{check.title}</span>
              <InfoHint text={check.why} label={`Чому це важливо: ${check.title}`} />
              {check.todoIssue ? <TodoBadge issue={check.todoIssue} reason={check.why} /> : null}
            </div>
            <div className={styles.detail}>{check.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
