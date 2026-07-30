import type { ScoreBreakdown } from "./types";
import styles from "./ListingScoreCard.module.css";

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#fbbf24";
  return "#f87171";
}

function overallVerdict(score: number): string {
  if (score >= 80) return "Сильний лістинг — тримайте курс.";
  if (score >= 60) return "Добре, є що покращити.";
  return "Потребує уваги — кілька слабких місць тягнуть оцінку вниз.";
}

const SUBSCORES: { key: keyof Omit<ScoreBreakdown, "overall">; label: string }[] = [
  { key: "title", label: "Заголовок" },
  { key: "tags", label: "Теги" },
  { key: "photos", label: "Фото" },
  { key: "description", label: "Опис" },
];

/** The overall ring plus the four sub-scores behind it, so a low number
 *  points at which section to fix.
 *
 *  Presentational: every number arrives computed by listingScore.ts off real
 *  fields. It used to be PRNG output — hence the `note` on each sub-score
 *  naming what was actually measured. */
export function ListingScoreCard({ score }: { score: ScoreBreakdown }) {
  return (
    <div className={styles.card}>
      <div className={styles.overall}>
        <div className={styles.ring} style={{ ["--pct" as string]: score.overall, ["--ringColor" as string]: scoreColor(score.overall) }}>
          <span className={styles.ringNum}>{score.overall}</span>
        </div>
        <div>
          <div className={styles.overallLabel}>Listing Score</div>
          <div className={styles.overallVerdict}>{overallVerdict(score.overall)}</div>
        </div>
      </div>

      <div className={styles.subgrid}>
        {SUBSCORES.map(({ key, label }) => {
          const sub = score[key];
          return (
            <div className={styles.sub} key={key}>
              <div className={styles.subHead}>
                <span className={styles.subLabel}>{label}</span>
                <span className={styles.subNum} style={{ color: scoreColor(sub.score) }}>{sub.score}</span>
              </div>
              <div className={styles.subBar}>
                <div style={{ width: `${sub.score}%`, background: scoreColor(sub.score) }} />
              </div>
              <div className={styles.subNote}>{sub.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
