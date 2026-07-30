import { memo, useMemo } from "react";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
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

/** Placeholder cutoffs — real scoring logic comes later. */
const KD_OPPORTUNITY_BELOW = 50;
const KD_WALL_AT = 75;

function kdTone(kd: number): "positive" | "warning" | "negative" {
  if (kd < KD_OPPORTUNITY_BELOW) return "positive";
  if (kd < KD_WALL_AT) return "warning";
  return "negative";
}

export const KeywordsTable = memo(function KeywordsTable({ keywords, onToggleTracked }: KeywordsTableProps) {
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
              <StarToggleButton
                active={kw.tracked}
                activeTitle="У відстежуваних"
                inactiveTitle="Додати у відстежувані"
                onClick={() => onToggleTracked(kw.id)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
