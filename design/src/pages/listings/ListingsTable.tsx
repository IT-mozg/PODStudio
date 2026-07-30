import { memo } from "react";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { Pill } from "../../shared/components/Pill";
import type { Listing } from "./types";
import styles from "./ListingsTable.module.css";

interface ListingsTableProps {
  listings: Listing[];
  onToggleTracked: (listingId: string) => void;
  /** Omit to make rows non-navigable, for callers whose ids the detail pages
   *  can't resolve — no pointer cursor instead of a "not found" page. */
  onSelectListing?: (listing: Listing) => void;
  /** Same, for the shop-name cell. */
  onSelectShop?: (shopId: string) => void;
}

const MAX_VISIBLE_TAGS = 2;

/** ShopsTable's shape with a thumbnail + title lead cell and tags instead of
 *  a niche. Memoized — pair with useCallback'd handlers in the caller. */
export const ListingsTable = memo(function ListingsTable({ listings, onToggleTracked, onSelectListing, onSelectShop }: ListingsTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Лістинг</th>
          <th>Магазин</th>
          <th>Перегляди</th>
          <th>Продажі (оц.)</th>
          <th>Дохід (оц.)</th>
          <th>Теги</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {listings.map((listing) => (
          <tr
            key={listing.id}
            className={onSelectListing ? styles.clickable : undefined}
            onClick={onSelectListing ? () => onSelectListing(listing) : undefined}
          >
            <td>
              <div className={styles.listingCell}>
                <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${listing.thumbGradient[0]}, ${listing.thumbGradient[1]})` }} />
                <div className={styles.listingText}>
                  <div className={styles.listingTitle}>{listing.title}</div>
                  <div className={styles.numSub}>
                    {listing.ageMonths === null ? "вік невідомий" : `${listing.ageMonths} міс. на Etsy`}
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span
                className={onSelectShop ? styles.shopLink : styles.shopName}
                onClick={
                  onSelectShop
                    ? (e) => {
                        e.stopPropagation();
                        onSelectShop(listing.shopId);
                      }
                    : undefined
                }
              >
                {listing.shopName}
              </span>
            </td>
            <td>
              <div className={styles.num}>{listing.views}</div>
            </td>
            <td>
              <div className={styles.num}>{listing.sales}</div>
            </td>
            <td>
              <div className={styles.num}>{listing.revenue}</div>
            </td>
            <td>
              <div className={styles.tagRow}>
                {listing.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                  <Pill size="sm" key={tag}>{tag}</Pill>
                ))}
                {listing.tags.length > MAX_VISIBLE_TAGS && (
                  <span className={styles.tagMore}>+{listing.tags.length - MAX_VISIBLE_TAGS}</span>
                )}
              </div>
            </td>
            <td>
              <StarToggleButton
                active={listing.tracked}
                activeTitle="У відстежуваних"
                inactiveTitle="Додати у відстежувані"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTracked(listing.id);
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});
