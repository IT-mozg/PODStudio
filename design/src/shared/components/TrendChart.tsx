import { useId } from "react";
import { smoothPath } from "../smoothPath";
import styles from "./TrendChart.module.css";

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
  formatValue?: (value: number) => string;
}

/** Generic search/sales trend chart — used by Ключові слова today,
 *  reusable anywhere else a "value over time" needs the same look. */
export function TrendChart({ data, height = 200, formatValue }: TrendChartProps) {
  const gradientId = useId();
  const width = 600;
  const padTop = 14;
  const padBottom = 26;
  const plotH = height - padTop - padBottom;

  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const points: [number, number][] = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = padTop + plotH - ((d.value - min) / span) * plotH;
    return [x, y];
  });

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${width} ${padTop + plotH} L 0 ${padTop + plotH} Z`;
  const last = points[points.length - 1];
  const peak = points.reduce((a, b) => (b[1] < a[1] ? b : a));

  return (
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={width} y1={padTop + plotH * f} y2={padTop + plotH * f} className={styles.gridline} />
      ))}

      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" className={styles.line} />

      <circle cx={peak[0]} cy={peak[1]} r="4" className={styles.peakDot} />
      <circle cx={last[0]} cy={last[1]} r="4" className={styles.endDot} />
      {formatValue && (
        <text x={Math.min(last[0], width - 4)} y={last[1] - 10} textAnchor="end" className={styles.endLabel}>
          {formatValue(data[data.length - 1].value)}
        </text>
      )}

      {data.map((d, i) => {
        if (data.length > 8 && i % 2 !== 0 && i !== data.length - 1) return null;
        return (
          <text key={d.label} x={points[i][0]} y={height - 6} textAnchor="middle" className={styles.axisLabel}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
