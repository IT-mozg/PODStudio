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
  /** Pass mockListingsRepository for the fixed demo data. */
  repository?: ListingsRepository;
}

/** Route wrapper: resolves :listingId against the repository and hands a
 *  plain ListingDetail to the route-agnostic ListingDetailView. */
export function ListingDetailPage({ repository = httpListingsRepository }: ListingDetailPageProps) {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  // undefined = loading, null = no such listing, object = loaded.
  const [listing, setListing] = useState<ListingDetail | null | undefined>(undefined);
  // A fourth state, distinct from "not found": getDetailById answers null
  // only for the API's own 404, and the rest would spin forever.
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button so the effect re-runs on the same id.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!listingId) return;
    // Stale-response guard: navigating mid-flight would otherwise let
    // whichever request resolves last win.
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
        // A failed write must not show a bookmark the backend never saved.
        console.error(e);
        setError(describeError(e));
        return;
      }
      // Patch in place: the detail is a live Etsy round trip and nothing
      // else changed. Guarded on the id because nothing cancels an in-flight
      // POST — navigating away first would flip the star on whichever
      // listing is on screen while the server toggled another.
      setListing((prev) => (prev && prev.id === id ? { ...prev, tracked: !prev.tracked } : prev));
    },
    [repository],
  );

  if (error) return <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  if (listing === undefined) return <LoadingState />;
  // Not PlaceholderPage: that says "ще не перенесено на React". This branch
  // means Etsy no longer has the listing — usually a deleted bookmark.
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
