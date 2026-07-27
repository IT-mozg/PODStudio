import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mockListingsRepository, type ListingsRepository } from "./listingsRepository";
import type { Listing } from "./types";
import { ListingDetailView } from "./ListingDetailView";
import { PlaceholderPage } from "../PlaceholderPage";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { describeError } from "../../shared/api";

interface ListingDetailPageProps {
  repository?: ListingsRepository;
}

/** Route wrapper: resolves :listingId from the URL against the
 *  repository, then hands a plain Listing to the (route-agnostic)
 *  ListingDetailView — same shape as ShopDetailPage/ShopDetailView. */
export function ListingDetailPage({ repository = mockListingsRepository }: ListingDetailPageProps) {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  // Same reason as ShopDetailPage: httpListingsRepository.getById propagates
  // its failures, and without a state for them the page would sit on the
  // spinner forever.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) return;
    setListing(undefined);
    setError(null);
    repository.getById(listingId).then(setListing).catch((e) => {
      console.error(e);
      setError(describeError(e));
    });
  }, [repository, listingId]);

  async function handleToggleTracked(id: string) {
    try {
      await repository.toggleTracked(id);
      if (listingId) setListing(await repository.getById(listingId));
    } catch (e) {
      console.error(e);
      setError(describeError(e));
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (listing === undefined) return <LoadingState />;
  if (listing === null) return <PlaceholderPage pageLabel="Лістинг не знайдено" />;

  return (
    <ListingDetailView
      listing={listing}
      onBack={() => navigate(-1)}
      onToggleTracked={handleToggleTracked}
      onSelectListing={(id) => navigate(`/listings/${id}`)}
      onSelectShop={(shopId) => navigate(`/shops/${shopId}`)}
    />
  );
}
