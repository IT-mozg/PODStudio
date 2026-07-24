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
}

/** Used by the dashboard's "Мої магазини" widget and the shops page's
 *  "Відстежувані" tab — same shape, different data source. */
export function ShopStatusList({ shops }: ShopStatusListProps) {
  return (
    <div className={styles.list}>
      {shops.map((shop) => (
        <div className={styles.row} key={shop.id}>
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
