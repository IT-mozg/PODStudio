import { useCallback, useState } from "react";
import type { Listing } from "./types";
import styles from "./SimilarListingsCarousel.module.css";

interface SimilarListingsCarouselProps {
  items: Listing[];
  onSelect: (id: string) => void;
}

/** Presentational only: every non-loaded state belongs to
 *  SimilarListingsSection, which owns the fetch. Rendering nothing on an
 *  empty list keeps this component from having an opinion about why.
 *
 *  The cards carry real Etsy ids — the version #78 removed minted "l1-sim0",
 *  which dead-ended on "Лістинг не знайдено" on every click. */
export function SimilarListingsCarousel({ items, onSelect }: SimilarListingsCarouselProps) {
  // Not just the "no URL" case: container.ui_thumb rewrites to the il_570xN
  // rendition, which not every listing has, and the caches have no TTL, so a
  // URL can have rotated. Without this the card showed a broken-image glyph.
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const markFailed = useCallback((id: string) => {
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  if (!items.length) return null;

  return (
    <div className={styles.row}>
      {items.map((item) => (
        <div className={styles.card} key={item.id} onClick={() => onSelect(item.id)}>
          {item.thumbUrl && !failed.has(item.id) ? (
            <img
              className={styles.thumb}
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              onError={() => markFailed(item.id)}
            />
          ) : (
            <div
              className={styles.thumb}
              style={{ background: `linear-gradient(135deg, ${item.thumbGradient[0]}, ${item.thumbGradient[1]})` }}
            />
          )}
          <div className={styles.body}>
            <div className={styles.title}>{item.title}</div>
            {/* Etsy publishes no per-listing sales figure to anyone, so every
                number here is models/conversion_rate.py's estimate and is
                labelled as one. A zero is shown as a zero: the whole column
                is modelled, so "the model says 0" is the same kind of answer
                as "the model says 40", and rendering it as "—" only made the
                card look broken. (The backend also flattens the model's None
                to 0 — see listings_payload — so a 0 can mean "no price or no
                FX rate to compute from"; that collapse is the project
                owner's call and is deliberate here too.) */}
            <div className={styles.meta}>≈ {item.sales} прод. (оцінка)</div>
          </div>
        </div>
      ))}
    </div>
  );
}
