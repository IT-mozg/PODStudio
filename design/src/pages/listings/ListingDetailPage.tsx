import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { httpListingsRepository } from "./httpListingsRepository";
import type { ListingsRepository } from "./listingsRepository";
import type { ListingDetail } from "./types";
import { ListingDetailView } from "./ListingDetailView";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { describeError } from "../../shared/api";

interface ListingDetailPageProps {
  /** Defaults to the real Etsy-backed repository. Pass
   *  mockListingsRepository for the fixed demo data. */
  repository?: ListingsRepository;
}

/** Route wrapper: resolves :listingId from the URL against the
 *  repository, then hands a plain ListingDetail to the (route-agnostic)
 *  ListingDetailView — same shape as ShopDetailPage/ShopDetailView. */
export function ListingDetailPage({ repository = httpListingsRepository }: ListingDetailPageProps) {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  // undefined = loading, null = no such listing, object = loaded.
  const [listing, setListing] = useState<ListingDetail | null | undefined>(undefined);
  // Failures are a fourth state, distinct from "not found": getDetailById
  // only answers null for the API's *own* 404, and without somewhere to put
  // the rest the page would sit on the spinner forever (commit 35c5195).
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button so the effect re-runs on the same id.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!listingId) return;
    // Guard against a stale response overwriting a newer one — navigating
    // between listings mid-flight would otherwise let whichever request
    // resolves last win. Same guard as ListingsPage/ShopsPage.
    let cancelled = false;
    setListing(undefined);
    setError(null);
    repository
      .getDetailById(listingId)
      .then((found) => {
        if (!cancelled) setListing(found);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repository, listingId, reloadToken]);

  const handleToggleTracked = useCallback(
    async (id: string) => {
      try {
        await repository.toggleTracked(id);
      } catch (e) {
        // Don't flip the star on a failed write — it would show a bookmark
        // the backend never saved.
        console.error(e);
        setError(describeError(e));
        return;
      }
      // Patch the flag in place rather than re-fetching: the listing detail
      // is a live Etsy round trip, and nothing else about it changed.
      //
      // Guarded on the id, not just on `prev` being set: nothing cancels an
      // in-flight POST, and /listings/:listingId is one route, so navigating
      // to another listing before it resolves would otherwise flip the star
      // on whichever listing is on screen by then, while the server toggled
      // a different one. Same id-matched shape as ListingsPage.
      setListing((prev) => (prev && prev.id === id ? { ...prev, tracked: !prev.tracked } : prev));
    },
    [repository],
  );

  if (error) return <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  if (listing === undefined) return <LoadingState />;
  // Deliberately not PlaceholderPage: that one says "цю сторінку ще не
  // перенесено на React", which is about unported pages. Against the live
  // backend this branch means Etsy no longer has the listing — most often a
  // tracked bookmark whose listing was deleted — and the copy has to say so.
  if (listing === null) {
    return (
      <NoDataNotice>
        Лістинг {listingId} не знайдено — найімовірніше, продавець видалив або
        деактивував його на Etsy.
      </NoDataNotice>
    );
  }

  return (
    <ListingDetailView
      listing={listing}
      onBack={() => navigate(-1)}
      onToggleTracked={handleToggleTracked}
      onSelectListing={(id) => navigate(`/listings/${id}`)}
      onSelectShop={(id) => navigate(`/shops/${id}`)}
      repository={repository}
    />
  );
}
