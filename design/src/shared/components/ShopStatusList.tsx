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
  /** Optional — omitted by callers whose ids the shop detail page can't
   *  resolve. Rows then render non-navigable rather than dead-ending, the
   *  same rule TrendList and ListingsTable follow. */
  onSelect?: (shopId: string) => void;
}

/** Used by the dashboard's "Мої магазини" widget. Its entries still come
 *  from dashboardData.ts's hardcoded mocks, whose ids ("ct", "vg", ...) are
 *  not Etsy shop_ids — so the dashboard passes no onSelect until #9 gives
 *  it a real repository. */
export function ShopStatusList({ shops, onSelect }: ShopStatusListProps) {
  return (
    <div className={styles.list}>
      {shops.map((shop) => (
        <div
          className={onSelect ? `${styles.row} ${styles.clickable}` : styles.row}
          key={shop.id}
          onClick={onSelect ? () => onSelect(shop.id) : undefined}
        >
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
