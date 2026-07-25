import { memo } from "react";
import { StarToggleButton } from "../../shared/components/StarToggleButton";
import { Pill } from "../../shared/components/Pill";
import type { Listing } from "./types";
import styles from "./ListingsTable.module.css";

interface ListingsTableProps {
  listings: Listing[];
  onToggleTracked: (listingId: string) => void;
  onSelectListing: (listing: Listing) => void;
}

const MAX_VISIBLE_TAGS = 2;

/** Same shape as ShopsTable, but the leading cell is a product thumbnail
 *  + title (a listing, not a shop), and rows carry tags instead of a
 *  single niche — the two real differences the source is about.
 *  Memoized: pair with useCallback'd handlers in the caller so an
 *  unrelated re-render upstream doesn't repaint the whole table. */
export const ListingsTable = memo(function ListingsTable({ listings, onToggleTracked, onSelectListing }: ListingsTableProps) {
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
          <tr key={listing.id} onClick={() => onSelectListing(listing)}>
            <td>
              <div className={styles.listingCell}>
                <div className={styles.thumb} style={{ background: `linear-gradient(135deg, ${listing.thumbGradient[0]}, ${listing.thumbGradient[1]})` }} />
                <div>
                  <div className={styles.listingTitle}>{listing.title}</div>
                  <div className={styles.numSub}>{listing.ageMonths} міс. на Etsy</div>
                </div>
              </div>
            </td>
            <td>
              <span className={styles.shopLink}>{listing.shopName}</span>
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
