import { memo } from "react";
import { GrowthBadge } from "../../shared/components/GrowthBadge";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { Pill } from "../../shared/components/Pill";
import type { Shop } from "./types";
import styles from "./ShopsTable.module.css";

interface ShopsTableProps {
  shops: Shop[];
  onToggleTracked: (shopId: string) => void;
  onSelectShop: (shop: Shop) => void;
}

/** Pure presentation — rows come from `shops`, the star click is
 *  reported upward via `onToggleTracked` (no direct repository
 *  access here, so this component doesn't care where data comes from).
 *  Memoized — pair with useCallback'd handlers in the caller. */
export const ShopsTable = memo(function ShopsTable({ shops, onToggleTracked, onSelectShop }: ShopsTableProps) {
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
            <tr key={shop.id} onClick={() => onSelectShop(shop)}>
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
                <Pill>{shop.niche}</Pill>
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
                <StarToggleButton
                  active={shop.tracked}
                  activeTitle="У відстежуваних"
                  inactiveTitle="Додати у відстежувані"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTracked(shop.id);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
});
