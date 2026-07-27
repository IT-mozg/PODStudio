import type { ComponentType, ReactNode } from "react";
import styles from "./StatGrid.module.css";

export interface StatDatum {
  id: string;
  icon: ComponentType<{ size?: number }>;
  /** Optional so a tile with no real value behind it can carry a `badge`
   *  instead — a delta on a "—" would be describing nothing. */
  delta?: { text: string; tone: "up" | "warn" | "neutral" };
  /** Takes the delta's place. A TodoBadge, where the metric has no data
   *  source yet. */
  badge?: ReactNode;
  value: string;
  label: string;
}

function StatCard({ stat }: { stat: StatDatum }) {
  const Icon = stat.icon;
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div className={styles.icon}>
          <Icon size={16} />
        </div>
        {stat.badge ??
          (stat.delta && (
            <span className={`${styles.delta} ${styles[stat.delta.tone]}`}>{stat.delta.text}</span>
          ))}
      </div>
      <div className={styles.value}>{stat.value}</div>
      <div className={styles.label}>{stat.label}</div>
    </div>
  );
}

/** Generic stat-card row — Дашборд and Ключові слова both pass their
 *  own icon + data, this component only lays them out. */
export function StatGrid({ stats }: { stats: StatDatum[] }) {
  return (
    <div className={styles.grid}>
      {stats.map((stat) => (
        <StatCard stat={stat} key={stat.id} />
      ))}
    </div>
  );
}
