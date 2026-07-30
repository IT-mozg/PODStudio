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

/** Owns the fetch for the "similar listings" block, so ListingDetailView
 *  stays props-in and grows no second data source.
 *
 *  Two things Etsy doesn't back, which the block states outright: there is no
 *  similar/recommended endpoint, so the cards are a keyword search on this
 *  title and the query is shown; and there are no per-listing sales, so the
 *  ordering is models/conversion_rate.py's estimate and is labelled as one.
 *
 *  Fetches only near the viewport — two Etsy requests against a 5 req/s key,
 *  and most listings are opened without anyone scrolling this far. */
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
    // Stale-response guard: otherwise cards paint under the wrong listing.
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
      ) : !seen ? (
        // Nothing has started, so nothing is announced — the slot just holds
        // its height. A spinner here promised work that hadn't begun, and in
        // a background tab (where every element reads as non-intersecting) it
        // span forever with no request and no retry behind it.
        null
      ) : !result ? (
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
