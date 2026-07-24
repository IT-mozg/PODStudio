import styles from "./RatingBars.module.css";

export interface RatingBreakdownDatum {
  stars: number;
  pct: number;
}

interface RatingBarsProps {
  data: RatingBreakdownDatum[];
}

/** 5→1 star distribution bars, e.g. under a shop or listing rating. */
export function RatingBars({ data }: RatingBarsProps) {
  return (
    <div className={styles.rows}>
      {data.map((d) => (
        <div className={styles.row} key={d.stars}>
          <span className={styles.starLabel}>{d.stars}★</span>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${d.pct}%` }} />
          </div>
          <span className={styles.pct}>{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}
