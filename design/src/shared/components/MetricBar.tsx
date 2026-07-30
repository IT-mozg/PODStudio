import styles from "./MetricBar.module.css";

interface MetricBarProps {
  /** 0..1 — how much of the pill to fill. Caller decides what "full" means. */
  ratio: number;
  tone: "positive" | "negative" | "warning";
  label: string;
}

export function MetricBar({ ratio, tone, label }: MetricBarProps) {
  const width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  return (
    <div className={styles.track}>
      <div className={`${styles.fill} ${styles[tone]}`} style={{ width }} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
