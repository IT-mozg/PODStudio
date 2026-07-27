import { memo, useMemo, useState } from "react";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { MetricBar } from "../../shared/components/MetricBar";
import { Sparkline } from "../../shared/components/Sparkline";
import type { ListingTag } from "./types";
import styles from "./TagsAuditTable.module.css";

/** Same 3-way split as kdTone on Ключові слова: low KD is the easy
 *  win (green), high KD is the wall (red). */
function kdTone(kd: number): "positive" | "warning" | "negative" {
  if (kd < 50) return "positive";
  if (kd < 75) return "warning";
  return "negative";
}

/** Largest real value in a column, for scaling the bars. Ignores the nulls
 *  that every metric currently is (see below) and never returns 0. */
function maxOf(tags: ListingTag[], pick: (t: ListingTag) => number | null): number {
  return Math.max(1, ...tags.map(pick).filter((v): v is number => v !== null));
}

/** Same table as KeywordsTable on Ключові слова — MetricBar for
 *  volume/competition/KD, Sparkline for the trend, star to save a tag
 *  — just scoped to one listing's tags instead of a search result.
 *  Saving is local to this page for now (no cross-listing tag
 *  repository yet), same as any other page-local UI state.
 *
 *  The tags themselves are real (Etsy gives up to 13 per listing); every
 *  metric beside them is `null` until the search-volume engine (#54/#56)
 *  exists, and renders "—". They used to be PRNG output that looked exactly
 *  like measured demand data. */
export const TagsAuditTable = memo(function TagsAuditTable({ tags }: { tags: ListingTag[] }) {
  const maxVolume = useMemo(() => maxOf(tags, (t) => t.volume), [tags]);
  const maxCompetition = useMemo(() => maxOf(tags, (t) => t.competition), [tags]);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  function toggleSaved(tag: string) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Тег</th>
          <th>Обʼєм пошуку</th>
          <th>Конкуренція</th>
          <th>KD</th>
          <th>Тренд</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tags.map((row) => {
          const isSaved = saved.has(row.tag);
          return (
            <tr key={row.tag}>
              <td>
                <div className={styles.tagText}>{row.tag}</div>
              </td>
              <td>
                {row.volume === null ? (
                  <span className={styles.noData}>—</span>
                ) : (
                  <MetricBar ratio={row.volume / maxVolume} tone="positive" label={row.volume.toLocaleString("uk-UA")} />
                )}
              </td>
              <td>
                {row.competition === null ? (
                  <span className={styles.noData}>—</span>
                ) : (
                  <MetricBar ratio={row.competition / maxCompetition} tone="negative" label={`${row.competition}%`} />
                )}
              </td>
              <td>
                {row.kd === null ? (
                  <span className={styles.noData}>—</span>
                ) : (
                  <MetricBar ratio={row.kd / 100} tone={kdTone(row.kd)} label={String(row.kd)} />
                )}
              </td>
              <td>
                {row.sparkline === null ? (
                  <span className={styles.noData}>—</span>
                ) : (
                  <Sparkline values={row.sparkline} />
                )}
              </td>
              <td>
                <StarToggleButton
                  active={isSaved}
                  activeTitle="У збережених"
                  inactiveTitle="Зберегти тег"
                  onClick={() => toggleSaved(row.tag)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});
