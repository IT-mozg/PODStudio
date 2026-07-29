import { parseCount } from "../../shared/money";
import type { Listing } from "./types";
import styles from "./SimilarListingsCarousel.module.css";

interface SimilarListingsCarouselProps {
  items: Listing[];
  onSelect: (id: string) => void;
}

/** Presentational only — every non-loaded state (not yet in view, loading,
 *  failed, nothing found) belongs to SimilarListingsSection, which owns the
 *  fetch. Rendering nothing here on an empty list keeps this component from
 *  having an opinion about why the list is empty.
 *
 *  The cards carry real Etsy listing ids (#86): the version #78 removed
 *  minted ids like "l1-sim0", which dead-ended on "Лістинг не знайдено" on
 *  every click. */
export function SimilarListingsCarousel({ items, onSelect }: SimilarListingsCarouselProps) {
  if (!items.length) return null;

  return (
    <div className={styles.row}>
      {items.map((item) => (
        <div className={styles.card} key={item.id} onClick={() => onSelect(item.id)}>
          {item.thumbUrl ? (
            <img className={styles.thumb} src={item.thumbUrl} alt="" loading="lazy" />
          ) : (
            <div
              className={styles.thumb}
              style={{ background: `linear-gradient(135deg, ${item.thumbGradient[0]}, ${item.thumbGradient[1]})` }}
            />
          )}
          <div className={styles.body}>
            <div className={styles.title}>{item.title}</div>
            {/* Etsy publishes no per-listing sales figure to anyone, so this
                is models/conversion_rate.py's estimate and has to read as
                one. The backend sends 0 where the model couldn't compute an
                answer at all (no price, or no FX rate) — that is "unknown",
                not a measured zero, so it renders as "—". */}
            <div className={styles.meta}>
              {parseCount(item.sales) === 0 ? "—" : `≈ ${item.sales} прод. (оцінка)`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
