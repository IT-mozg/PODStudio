import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mockListingsRepository, type ListingsRepository } from "./listingsRepository";
import type { Listing } from "./types";
import { ListingDetailView } from "./ListingDetailView";
import { PlaceholderPage } from "../PlaceholderPage";
import { LoadingState } from "../../shared/components/LoadingState";

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

  useEffect(() => {
    if (!listingId) return;
    setListing(undefined);
    repository.getById(listingId).then(setListing);
  }, [repository, listingId]);

  async function handleToggleTracked(id: string) {
    await repository.toggleTracked(id);
    if (listingId) setListing(await repository.getById(listingId));
  }

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
