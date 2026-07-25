import { ShopAvatar } from "./ShopAvatar";
import styles from "./ShopStatusList.module.css";

export interface ShopStatusEntry {
  id: string;
  initials: string;
  name: string;
  meta: string;
  status: "ok" | "alert";
}

interface ShopStatusListProps {
  shops: ShopStatusEntry[];
  onSelect: (shopId: string) => void;
}

/** Used by the dashboard's "Мої магазини" widget — each entry's `id`
 *  is a real shopsRepository id, so a row is always a valid
 *  /shops/:id link. */
export function ShopStatusList({ shops, onSelect }: ShopStatusListProps) {
  return (
    <div className={styles.list}>
      {shops.map((shop) => (
        <div className={styles.row} key={shop.id} onClick={() => onSelect(shop.id)}>
          <ShopAvatar initials={shop.initials} />
          <div className={styles.body}>
            <div className={styles.name}>{shop.name}</div>
            <div className={styles.meta}>{shop.meta}</div>
          </div>
          <span className={`${styles.status} ${styles[shop.status]}`}>{shop.status === "ok" ? "ОК" : "Увага"}</span>
        </div>
      ))}
    </div>
  );
}
