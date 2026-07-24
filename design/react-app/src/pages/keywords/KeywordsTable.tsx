import { useMemo } from "react";
import { StarIcon } from "../../shared/icons";
import { MetricBar } from "../../shared/components/MetricBar";
import { Sparkline } from "../../shared/components/Sparkline";
import type { Keyword } from "./types";
import styles from "./KeywordsTable.module.css";

interface KeywordsTableProps {
  keywords: Keyword[];
  onToggleTracked: (keywordId: string) => void;
}

function parseNum(formatted: string): number {
  return Number(formatted.replace(/[^\d]/g, "")) || 0;
}

/** KD tone/fill: below 50 reads as an opportunity (green), 50-75 a
 *  stretch (amber), above 75 a wall (red). The exact cutoffs are a
 *  placeholder — real scoring logic comes later. */
function kdTone(kd: number): "positive" | "warning" | "negative" {
  if (kd < 50) return "positive";
  if (kd < 75) return "warning";
  return "negative";
}

export function KeywordsTable({ keywords, onToggleTracked }: KeywordsTableProps) {
  const maxVolume = useMemo(() => Math.max(1, ...keywords.map((k) => parseNum(k.searchVolume))), [keywords]);
  const maxCompetition = useMemo(() => Math.max(1, ...keywords.map((k) => parseNum(k.competition))), [keywords]);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Ключове слово</th>
          <th>Обсяг пошуку</th>
          <th>Конкуренція</th>
          <th>KD</th>
          <th>Тренд</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {keywords.map((kw) => (
          <tr key={kw.id}>
            <td>
              <div className={styles.keywordText}>{kw.text}</div>
            </td>
            <td>
              <MetricBar ratio={parseNum(kw.searchVolume) / maxVolume} tone="positive" label={kw.searchVolume} />
            </td>
            <td>
              <MetricBar ratio={parseNum(kw.competition) / maxCompetition} tone="negative" label={kw.competition} />
            </td>
            <td>
              <MetricBar ratio={kw.kd / 100} tone={kdTone(kw.kd)} label={String(kw.kd)} />
            </td>
            <td>
              <Sparkline values={kw.sparkline} />
            </td>
            <td>
              <div className={styles.actions}>
                <div
                  className={kw.tracked ? `${styles.starBtn} ${styles.starBtnActive}` : styles.starBtn}
                  title={kw.tracked ? "У відстежуваних" : "Додати у відстежувані"}
                  onClick={() => onToggleTracked(kw.id)}
                >
                  <StarIcon size={14} />
                </div>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
