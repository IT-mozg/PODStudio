import styles from "./BarBreakdown.module.css";

export interface BarDatum {
  label: string;
  value: number;
}

interface BarBreakdownProps {
  data: BarDatum[];
}

/** Simple vertical histogram — e.g. price-range distribution. Bar
 *  height is relative to the tallest bar in the set. */
export function BarBreakdown({ data }: BarBreakdownProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={styles.chart}>
      {data.map((d) => (
        <div className={styles.col} key={d.label}>
          <div className={styles.bar} style={{ height: `${(d.value / max) * 100}%` }} title={`${d.label}: ${d.value}`} />
          <span className={styles.label}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
