import type { TrendPoint } from "./TrendChart";
import styles from "./BarTrendChart.module.css";

interface BarTrendChartProps {
  data: TrendPoint[];
  formatValue?: (value: number) => string;
  height?: number;
}

/** Month-by-month bar chart (eRank "Sales History" style) — plain CSS
 *  bars, not SVG, so a real per-bar hover tooltip is just a child div
 *  revealed on :hover, no JS state needed. The last bar (current
 *  month) is highlighted in amber to match the reference. */
export function BarTrendChart({ data, formatValue = (v) => String(v), height = 220 }: BarTrendChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <div className={styles.yAxis} style={{ height }}>
          <span>{formatValue(max)}</span>
          <span>{formatValue(max / 2)}</span>
          <span>0</span>
        </div>
        <div className={styles.plot} style={{ height }}>
          <div className={styles.gridline} style={{ bottom: "0%" }} />
          <div className={styles.gridline} style={{ bottom: "50%" }} />
          <div className={styles.gridline} style={{ bottom: "100%" }} />
          <div className={styles.bars}>
            {data.map((d, i) => (
              <div className={styles.col} key={d.label}>
                <div
                  className={i === data.length - 1 ? `${styles.bar} ${styles.current}` : styles.bar}
                  style={{ height: `${(d.value / max) * 100}%` }}
                >
                  <div className={styles.tooltip}>{formatValue(d.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.labels}>
        {data.map((d) => (
          <span className={styles.label} key={d.label}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
