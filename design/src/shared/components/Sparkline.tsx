import { smoothPath } from "../smoothPath";
import styles from "./Sparkline.module.css";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** Tiny inline trend line for a table row — green when the series ends
 *  higher than it started, red when it ends lower. No axes/labels;
 *  the big picture lives in TrendChart, this is just a glance. */
export function Sparkline({ values, width = 90, height = 28 }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;

  const points: [number, number][] = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return [x, y];
  });

  const trendUp = values[values.length - 1] >= values[0];

  return (
    <svg className={styles.sparkline} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={smoothPath(points)} className={`${styles.line} ${trendUp ? styles.up : styles.down}`} />
    </svg>
  );
}
