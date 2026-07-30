import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { ISSUE_SHOP_REVIEWS } from "./shopTodoIssues";
import { PREVIEW_REVIEWS } from "./previewData";
import type { ShopReview } from "./types";
import styles from "./ShopReviewsGrid.module.css";

interface ShopReviewsGridProps {
  reviews: ShopReview[];
}

/** The Відгуки tab's card grid. Owns its empty state, so ShopDetailView
 *  never branches on emptiness.
 *
 *  Empty is its only state today: nothing fetches reviews yet, and the four
 *  cards it used to show were PRNG output with the same date on each. */
export function ShopReviewsGrid({ reviews }: ShopReviewsGridProps) {
  if (!reviews.length) {
    return (
      <NoDataNotice preview={<ShopReviewsGrid reviews={PREVIEW_REVIEWS} />}>
        Відгуки Etsy віддає через окремий ендпоінт, який ще не підключено
        (#{ISSUE_SHOP_REVIEWS}). Картки виглядатимуть так:
      </NoDataNotice>
    );
  }

  return (
    <div className={styles.reviewGrid}>
      {reviews.map((r) => (
        <div className={styles.reviewCard} key={r.id}>
          <div className={styles.reviewTop}>
            <span className={styles.reviewStars}>
              {"★".repeat(r.rating)}
              {"☆".repeat(5 - r.rating)}
            </span>
            <span className={styles.reviewDate}>{r.date}</span>
          </div>
          <div className={styles.reviewText}>{r.text}</div>
          <div className={styles.reviewRef}>Лістинг {r.listingRef}</div>
        </div>
      ))}
    </div>
  );
}
