import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { PREVIEW_SIMILAR } from "./previewData";
import type { Listing } from "./types";
import styles from "./SimilarListingsCarousel.module.css";

interface SimilarListingsCarouselProps {
  items: Listing[];
  onSelect: (id: string) => void;
}

/** Empty until #86. Etsy's API has no "similar listings" endpoint at all, so
 *  the previous version made the cards up — worse, it minted ids like
 *  "l1-sim0", which against real Etsy ids would have dead-ended on
 *  "Лістинг не знайдено" on every click. */
export function SimilarListingsCarousel({ items, onSelect }: SimilarListingsCarouselProps) {
  if (!items.length) {
    return (
      <NoDataNotice
        preview={<SimilarListingsCarousel items={PREVIEW_SIMILAR} onSelect={() => {}} />}
      >
        Etsy API не має ендпоінта «схожі лістинги» — підбір планується робити
        пошуком за спільними тегами. Картки виглядатимуть так:
      </NoDataNotice>
    );
  }

  return (
    <div className={styles.row}>
      {items.map((item) => (
        <div className={styles.card} key={item.id} onClick={() => onSelect(item.id)}>
          <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${item.thumbGradient[0]}, ${item.thumbGradient[1]})` }} />
          <div className={styles.body}>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.meta}>{item.sales} прод.</div>
          </div>
        </div>
      ))}
    </div>
  );
}
