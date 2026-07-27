import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { PREVIEW_SCORE } from "./previewData";
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

/** The single "how am I doing overall" answer for the page — an
 *  overall ring plus the four sub-scores it's built from, so a low
 *  overall number always points straight at which section to fix.
 *
 *  `null` until #84 computes it for real. Every number here — the ring and
 *  all four sub-scores — used to come out of a seeded PRNG, which made an
 *  invented verdict ("Сильний лістинг — тримайте курс") look like analysis. */
export function ListingScoreCard({ score }: { score: ScoreBreakdown | null }) {
  if (!score) {
    return (
      <NoDataNotice preview={<ListingScoreCard score={PREVIEW_SCORE} />}>
        Оцінку ще не підключено. Вона рахуватиметься з реальних полів лістинга —
        довжини заголовка, заповненості тегів, кількості фото та якості опису.
        Нижче — як це має виглядати.
      </NoDataNotice>
    );
  }

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
