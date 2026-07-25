import { avgUnitPrice } from "../../shared/money";
import type { Listing } from "./types";
import styles from "./SimilarListingsCarousel.module.css";

interface SimilarListingsCarouselProps {
  items: Listing[];
  onSelect: (id: string) => void;
}

export function SimilarListingsCarousel({ items, onSelect }: SimilarListingsCarouselProps) {
  return (
    <div className={styles.row}>
      {items.map((item) => (
        <div className={styles.card} key={item.id} onClick={() => onSelect(item.id)}>
          <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${item.thumbGradient[0]}, ${item.thumbGradient[1]})` }} />
          <div className={styles.body}>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.meta}>
              ${avgUnitPrice(item.sales, item.revenue).toFixed(2)} · {item.sales} прод.
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
