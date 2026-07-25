import { PanelCard } from "../../shared/components/PanelCard";
import { GrowthBadge } from "../../shared/components/GrowthBadge";
import type { TrendItemData } from "./dashboardData";
import styles from "./TrendList.module.css";

interface TrendListProps {
  items: TrendItemData[];
  onSelect: (listingId: string) => void;
}

export function TrendList({ items, onSelect }: TrendListProps) {
  return (
    <PanelCard>
      <div className={styles.list}>
        {items.map((item) => (
          <div className={styles.row} key={item.id} onClick={() => onSelect(item.id)}>
            <div className={styles.rank}>{item.rank}</div>
            <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${item.color[0]}, ${item.color[1]})` }} />
            <div className={styles.body}>
              <div className={styles.name}>{item.name}</div>
              <div className={styles.meta}>{item.meta}</div>
            </div>
            <GrowthBadge value={item.growth} />
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
