import { memo } from "react";
import { GrowthBadge } from "../../shared/components/GrowthBadge";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { Pill } from "../../shared/components/Pill";
import type { Shop } from "./types";
import styles from "./ShopsTable.module.css";

/** What the mapper puts in a field with no data. Rendered as a bare dash,
 *  never inside a Pill or GrowthBadge: a pill around "—" reads as a label
 *  that failed to load, and a growth badge puts a green up-arrow beside it
 *  while Etsy exposes nothing (#82, #81).
 *
 *  Also covers a null rating — a different absence: the source exists, the
 *  shop simply has no reviews yet. */
const UNKNOWN = "—";

interface ShopsTableProps {
  shops: Shop[];
  onToggleTracked: (shopId: string) => void;
  /** Omit to make rows non-navigable, for callers whose ids the detail page
   *  can't resolve — no pointer cursor instead of a "not found" page. */
  onSelectShop?: (shop: Shop) => void;
}

/** Pure presentation: the star click is reported upward, so this component
 *  never touches a repository. Memoized — pair with useCallback'd handlers. */
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
            <tr
              key={shop.id}
              className={onSelectShop ? styles.clickable : undefined}
              onClick={onSelectShop ? () => onSelectShop(shop) : undefined}
            >
              <td>
                <div className={styles.shopCell}>
                  <ShopAvatar initials={shop.initials} />
                  <div>
                    <div className={styles.shopCellName}>{shop.name}</div>
                    <div className={styles.shopCellAge}>
                      {shop.listings} лістингів{shop.ageMonths === null ? "" : ` · ${shop.ageMonths} міс.`}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                {shop.niche === UNKNOWN ? UNKNOWN : <Pill>{shop.niche}</Pill>}
              </td>
              <td>
                <div className={styles.num}>{shop.sales}</div>
              </td>
              <td>
                <div className={styles.num}>{shop.revenue}</div>
              </td>
              <td>
                {/* toFixed(2), like ShopDetailView: this column is monospace
                    and right-aligned, so a raw float would make one row read
                    "4.9" and the next "4.8571" in a column meant to be
                    scannable. Etsy sends one decimal today, but nothing in
                    the API guarantees that. */}
                <div className={styles.num}>{shop.rating?.toFixed(2) ?? UNKNOWN}</div>
                <div className={styles.numSub}>{shop.reviews} відгуків</div>
              </td>
              <td>
                {shop.growth === UNKNOWN ? UNKNOWN : <GrowthBadge value={shop.growth} />}
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
