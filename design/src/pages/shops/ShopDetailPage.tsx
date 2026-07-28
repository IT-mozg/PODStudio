import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ShopsRepository } from "./shopsRepository";
import { httpShopsRepository } from "./httpShopsRepository";
import type { Shop } from "./types";
import { ShopDetailView } from "./ShopDetailView";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { describeError } from "../../shared/api";

interface ShopDetailPageProps {
  repository?: ShopsRepository;
}

/** Route wrapper: resolves :shopId from the URL against the
 *  repository, then hands a plain Shop to the (route-agnostic)
 *  ShopDetailView. Keeps ShopDetailView reusable outside a router
 *  context too (e.g. if it's ever embedded rather than routed to). */
export function ShopDetailPage({ repository = httpShopsRepository }: ShopDetailPageProps) {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  // A repository that talks to the network can fail, and `shop` has no state
  // left to express that: `undefined` means "still loading" (the spinner
  // below) and `null` means "no such shop". Without this, a failed lookup
  // would leave the page spinning forever.
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button so the effect re-runs on the same id.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!shopId) return;
    // Guard against a stale response overwriting a newer one — navigating
    // between shops mid-flight would otherwise let whichever request
    // resolves last win. Same guard as ListingDetailPage/ShopsPage.
    let cancelled = false;
    setShop(undefined);
    setError(null);
    repository
      .getById(shopId)
      .then((found) => {
        if (!cancelled) setShop(found);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repository, shopId, reloadToken]);

  async function handleToggleTracked(id: string) {
    try {
      await repository.toggleTracked(id);
      // Re-read the shop the toggle was for, and only apply it if that is
      // still the shop on screen: nothing cancels an in-flight POST, so
      // navigating away before it resolves would otherwise drop another
      // shop's record into this page. Same id-matched shape as
      // ListingDetailPage.
      const refreshed = await repository.getById(id);
      setShop((prev) => (prev && prev.id === id ? refreshed : prev));
    } catch (e) {
      console.error(e);
      setError(describeError(e));
    }
  }

  if (error) return <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  if (shop === undefined) return <LoadingState />;
  // Deliberately not PlaceholderPage: that one says "цю сторінку ще не
  // перенесено на React", which is about unported pages. Against the live
  // backend this branch means Etsy has no such shop — a closed or renamed
  // one, or a non-numeric id that can't be an Etsy shop_id at all.
  if (shop === null) {
    return (
      <NoDataNotice>
        Магазин {shopId} не знайдено — найімовірніше, його закрито або
        перейменовано на Etsy.
      </NoDataNotice>
    );
  }

  return <ShopDetailView shop={shop} onBack={() => navigate(-1)} onToggleTracked={handleToggleTracked} />;
}
