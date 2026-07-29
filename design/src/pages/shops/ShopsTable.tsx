import { memo } from "react";
import { GrowthBadge } from "../../shared/components/GrowthBadge";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { Pill } from "../../shared/components/Pill";
import type { Shop } from "./types";
import styles from "./ShopsTable.module.css";

/** What the mapper puts in a field the backend has no data for. Such a value
 *  renders as a bare dash rather than inside a Pill/GrowthBadge: a pill
 *  around "—" reads as a UI element whose label failed to load, and a growth
 *  badge around one puts a green up-arrow next to it — i.e. "this shop is
 *  growing" — when in fact Etsy exposes nothing (niche is #82, growth #81).
 *
 *  Also stands in for a null rating, which is a different kind of absence:
 *  there the data source exists, the shop simply has no reviews yet. */
const UNKNOWN = "—";

interface ShopsTableProps {
  shops: Shop[];
  onToggleTracked: (shopId: string) => void;
  /** Omit to make rows non-navigable — for callers whose ids the detail page
   *  can't resolve yet (see ShopsPage against the real Etsy repository).
   *  Rows then render without a pointer cursor rather than clicking through
   *  to a "not found" page. Same pattern as ListingsTable. */
  onSelectShop?: (shop: Shop) => void;
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
