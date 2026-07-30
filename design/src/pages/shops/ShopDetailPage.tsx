import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ShopsRepository } from "./shopsRepository";
import { httpShopsRepository } from "./httpShopsRepository";
import type { SalesHistory, Shop } from "./types";
import { ShopDetailView } from "./ShopDetailView";
import { LoadingState } from "../../shared/components/LoadingState";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { describeError } from "../../shared/api";

interface ShopDetailPageProps {
  repository?: ShopsRepository;
}

/** Route wrapper: resolves :shopId against the repository and hands a plain
 *  Shop to the route-agnostic ShopDetailView. */
export function ShopDetailPage({ repository = httpShopsRepository }: ShopDetailPageProps) {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null | undefined>(undefined);
  // `shop` has no state left for failure: undefined is loading, null is "no
  // such shop". Without this a failed lookup spins forever.
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button so the effect re-runs on the same id.
  const [reloadToken, setReloadToken] = useState(0);
  // Its own state and its own effect, deliberately: the estimate costs up to
  // 13 Etsy requests (~3.5 s on a big shop), and folding it into the fetch
  // above would hold the whole page on a loading spinner for that long. It
  // also fails on its own terms — a shop with no reviews has no estimate,
  // which is an empty chart, not a broken page.
  const [salesHistory, setSalesHistory] = useState<SalesHistory | null | undefined>(undefined);

  useEffect(() => {
    if (!shopId) return;
    // Stale-response guard: otherwise whichever request resolves last wins.
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

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    setSalesHistory(undefined);
    repository
      .getSalesHistory(shopId)
      .then((history) => {
        if (!cancelled) setSalesHistory(history);
      })
      .catch((e) => {
        // Not setError: a failed estimate must not replace a page that
        // otherwise loaded fine. The chart falls back to its empty state.
        console.error(e);
        if (!cancelled) setSalesHistory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, shopId, reloadToken]);

  async function handleToggleTracked(id: string) {
    try {
      await repository.toggleTracked(id);
      // Apply only if it's still the shop on screen: nothing cancels an
      // in-flight POST, and navigating away would drop another shop's record
      // into this page.
      const refreshed = await repository.getById(id);
      setShop((prev) => (prev && prev.id === id ? refreshed : prev));
    } catch (e) {
      console.error(e);
      setError(describeError(e));
    }
  }

  if (error) return <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />;
  if (shop === undefined) return <LoadingState />;
  // Not PlaceholderPage: that says "ще не перенесено на React". This means
  // Etsy has no such shop — closed, renamed, or a non-numeric id.
  if (shop === null) {
    return (
      <NoDataNotice>
        Магазин {shopId} не знайдено — найімовірніше, його закрито або
        перейменовано на Etsy.
      </NoDataNotice>
    );
  }

  return (
    <ShopDetailView
      shop={shop}
      salesHistory={salesHistory}
      onBack={() => navigate(-1)}
      onToggleTracked={handleToggleTracked}
    />
  );
}
