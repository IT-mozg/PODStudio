import { StarIcon } from "../../shared/icons";
import { GrowthBadge } from "../../shared/components/GrowthBadge";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import type { Shop } from "./types";
import styles from "./ShopsTable.module.css";

interface ShopsTableProps {
  shops: Shop[];
  onToggleTracked: (shopId: string) => void;
}

/** Pure presentation — rows come from `shops`, the star click is
 *  reported upward via `onToggleTracked` (no direct repository
 *  access here, so this component doesn't care where data comes from). */
export function ShopsTable({ shops, onToggleTracked }: ShopsTableProps) {
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Магазин</th>
            <th>Ніша</th>
            <th>Продажі</th>
            <th>Дохід (оц.)</th>
            <th>Рейтинг</th>
            <th>Ріст</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shops.map((shop) => (
            <tr key={shop.id}>
              <td>
                <div className={styles.shopCell}>
                  <ShopAvatar initials={shop.initials} />
                  <div>
                    <div className={styles.shopCellName}>{shop.name}</div>
                    <div className={styles.shopCellAge}>
                      {shop.listings} лістингів · {shop.ageMonths} міс.
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <span className={styles.nicheTag}>{shop.niche}</span>
              </td>
              <td>
                <div className={styles.num}>{shop.sales}</div>
              </td>
              <td>
                <div className={styles.num}>{shop.revenue}</div>
              </td>
              <td>
                <div className={styles.num}>{shop.rating}</div>
                <div className={styles.numSub}>{shop.reviews} відгуків</div>
              </td>
              <td>
                <GrowthBadge value={shop.growth} />
              </td>
              <td>
                <div className={styles.actions}>
                  <div
                    className={shop.tracked ? `${styles.starBtn} ${styles.starBtnActive}` : styles.starBtn}
                    title={shop.tracked ? "У відстежуваних" : "Додати у відстежувані"}
                    onClick={() => onToggleTracked(shop.id)}
                  >
                    <StarIcon size={14} />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
