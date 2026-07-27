import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mockShopsRepository, type ShopsRepository } from "./shopsRepository";
import type { Shop } from "./types";
import { ShopDetailView } from "./ShopDetailView";
import { PlaceholderPage } from "../PlaceholderPage";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { describeError } from "../../shared/api";

interface ShopDetailPageProps {
  repository?: ShopsRepository;
}

/** Route wrapper: resolves :shopId from the URL against the
 *  repository, then hands a plain Shop to the (route-agnostic)
 *  ShopDetailView. Keeps ShopDetailView reusable outside a router
 *  context too (e.g. if it's ever embedded rather than routed to). */
export function ShopDetailPage({ repository = mockShopsRepository }: ShopDetailPageProps) {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  // A repository that talks to the network can fail, and `shop` has no state
  // left to express that: `undefined` means "still loading" (the spinner
  // below) and `null` means "no such shop". Without this, a failed lookup
  // would leave the page spinning forever.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shopId) return;
    setShop(undefined);
    setError(null);
    repository.getById(shopId).then(setShop).catch((e) => {
      console.error(e);
      setError(describeError(e));
    });
  }, [repository, shopId]);

  async function handleToggleTracked(id: string) {
    try {
      await repository.toggleTracked(id);
      if (shopId) setShop(await repository.getById(shopId));
    } catch (e) {
      console.error(e);
      setError(describeError(e));
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (shop === undefined) return <LoadingState />;
  if (shop === null) return <PlaceholderPage pageLabel="Магазин не знайдено" />;

  return <ShopDetailView shop={shop} onBack={() => navigate(-1)} onToggleTracked={handleToggleTracked} />;
}
