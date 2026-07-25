import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { mockShopsRepository, type ShopsRepository } from "./shopsRepository";
import type { Shop } from "./types";
import { ShopDetailView } from "./ShopDetailView";
import { PlaceholderPage } from "../PlaceholderPage";
import { LoadingState } from "../../shared/components/LoadingState";

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

  useEffect(() => {
    if (!shopId) return;
    setShop(undefined);
    repository.getById(shopId).then(setShop);
  }, [repository, shopId]);

  async function handleToggleTracked(id: string) {
    await repository.toggleTracked(id);
    if (shopId) setShop(await repository.getById(shopId));
  }

  if (shop === undefined) return <LoadingState />;
  if (shop === null) return <PlaceholderPage pageLabel="Магазин не знайдено" />;

  return <ShopDetailView shop={shop} onBack={() => navigate(-1)} onToggleTracked={handleToggleTracked} />;
}
