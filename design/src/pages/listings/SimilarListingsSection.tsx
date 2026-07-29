import { useEffect, useState } from "react";
import { describeError } from "../../shared/api";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { LoadingState } from "../../shared/components/LoadingState";
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { useOnScreen } from "../../shared/hooks/useOnScreen";
import { httpListingsRepository } from "./httpListingsRepository";
import type { ListingsRepository } from "./listingsRepository";
import { SimilarListingsCarousel } from "./SimilarListingsCarousel";
import type { Listing } from "./types";
import styles from "./SimilarListingsSection.module.css";

interface SimilarListingsSectionProps {
  listingId: string;
  onSelect: (id: string) => void;
  repository?: ListingsRepository;
}

/** Owns the fetch for the detail page's "similar listings" block (#86) —
 *  the same container/presentational split ShopReviewsGrid uses, so
 *  ListingDetailView stays a pure props-in component and doesn't grow a
 *  second data source of its own.
 *
 *  Two things this section must be honest about, because Etsy backs neither:
 *  there is no similar/recommended endpoint at all, so the cards are a
 *  keyword search on this listing's own title and the block says which
 *  query it ran; and Etsy publishes no per-listing sales, so the ordering is
 *  models/conversion_rate.py's estimate and is labelled as one.
 *
 *  Fetches only once the block is scrolled near the viewport: it costs two
 *  Etsy requests against a 5 req/s, 5000/day key, and most listings get
 *  opened without anyone reading this far down. */
export function SimilarListingsSection({
  listingId,
  onSelect,
  repository = httpListingsRepository,
}: SimilarListingsSectionProps) {
  const [ref, seen] = useOnScreen<HTMLDivElement>();
  const [result, setResult] = useState<{ query: string; items: Listing[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!seen || !listingId) return;
    // Same stale-response guard as ListingDetailPage: navigating between
    // listings mid-flight would otherwise let whichever request resolves
    // last paint its cards under the wrong listing.
    let cancelled = false;
    setResult(null);
    setError(null);
    repository
      .getSimilar(listingId)
      .then((found) => {
        if (!cancelled) setResult(found);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repository, listingId, seen, reloadToken]);

  return (
    <div className={styles.slot} ref={ref}>
      {error ? (
        <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : !seen || !result ? (
        <LoadingState />
      ) : !result.items.length ? (
        <NoDataNotice>
          {/* Only quote a query when there actually was one. The backend
              sends "" when the title had no usable words, and getSimilar
              sends "" when no search ran at all (the listing is gone from
              Etsy, or the id isn't numeric) — claiming a search came back
              empty would be wrong in both cases. */}
          {result.query ? (
            <>
              Etsy не має ендпоінта «схожі лістинги», тож підбір робиться
              пошуком за назвою цього лістинга — і за запитом «{result.query}»
              нічого, крім нього самого, не знайшлося.
            </>
          ) : (
            <>
              Etsy не має ендпоінта «схожі лістинги», тож підбір робиться
              пошуком за назвою цього лістинга — а тут виконати такий пошук не
              вдалося.
            </>
          )}
        </NoDataNotice>
      ) : (
        <>
          <div className={styles.criterion}>
            Підібрано пошуком Etsy за назвою: «<span className={styles.query}>{result.query}</span>».
            Відсортовано за оцінкою продажів (модель, не дані Etsy).
          </div>
          <SimilarListingsCarousel items={result.items} onSelect={onSelect} />
        </>
      )}
    </div>
  );
}
