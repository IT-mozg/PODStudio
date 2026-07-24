import { useMemo, useState } from "react";
import { StarIcon } from "../../shared/icons";
import { MetricBar } from "../../shared/components/MetricBar";
import { Sparkline } from "../../shared/components/Sparkline";
import type { ListingTag } from "./listingDetail";
import styles from "./TagsAuditTable.module.css";

/** Same 3-way split as kdTone on Ключові слова: low KD is the easy
 *  win (green), high KD is the wall (red). */
function kdTone(kd: number): "positive" | "warning" | "negative" {
  if (kd < 50) return "positive";
  if (kd < 75) return "warning";
  return "negative";
}

/** Same table as KeywordsTable on Ключові слова — MetricBar for
 *  volume/competition/KD, Sparkline for the trend, star to save a tag
 *  — just scoped to one listing's tags instead of a search result.
 *  Saving is local to this page for now (no cross-listing tag
 *  repository yet), same as any other page-local UI state. */
export function TagsAuditTable({ tags }: { tags: ListingTag[] }) {
  const maxVolume = useMemo(() => Math.max(1, ...tags.map((t) => t.volume)), [tags]);
  const maxCompetition = useMemo(() => Math.max(1, ...tags.map((t) => t.competition)), [tags]);
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
                <MetricBar ratio={row.volume / maxVolume} tone="positive" label={row.volume.toLocaleString("uk-UA")} />
              </td>
              <td>
                <MetricBar ratio={row.competition / maxCompetition} tone="negative" label={`${row.competition}%`} />
              </td>
              <td>
                <MetricBar ratio={row.kd / 100} tone={kdTone(row.kd)} label={String(row.kd)} />
              </td>
              <td>
                <Sparkline values={row.sparkline} />
              </td>
              <td>
                <div className={styles.actions}>
                  <div
                    className={isSaved ? `${styles.starBtn} ${styles.starBtnActive}` : styles.starBtn}
                    title={isSaved ? "У збережених" : "Зберегти тег"}
                    onClick={() => toggleSaved(row.tag)}
                  >
                    <StarIcon size={14} />
                  </div>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
