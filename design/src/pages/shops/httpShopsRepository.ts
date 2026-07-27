/* Real ShopsRepository implementation, backed by the Flask API
   (controllers/shops_controller.py) instead of mock data. This is
   ShopsPage's default repository. ShopDetailPage still defaults to
   mockShopsRepository (see shopsRepository.ts) — its detail view derives
   revenue/price/conversion numbers from fields the real backend has no data
   for, so it would silently render zeroes; that is issue #8, which is also
   why ShopsPage renders its rows non-navigable against this repository. */

import { apiFetch } from "../../shared/api";
import { mapApiShop, type ApiShop } from "./shopMapper";
import type { ShopSearchResult, ShopsRepository } from "./shopsRepository";
import type { Shop } from "./types";

interface ShopsResponse {
  shops: ApiShop[];
  count?: number;
}

class HttpShopsRepository implements ShopsRepository {
  /** Etsy can only look shops up by name — there is no way to list or rank
   *  shops by sales/rating/age (see models/etsy_api_shop_source.py), so an
   *  empty query has nothing to ask for. Rows come back in the backend's
   *  name-relevance order; the filter chips re-sort them client-side. */
  async search(query: string): Promise<ShopSearchResult> {
    if (!query.trim()) return { shops: [], total: 0 };
    const { shops, count } = await apiFetch<ShopsResponse>(
      `/api/shops?query=${encodeURIComponent(query.trim())}`,
    );
    const mapped = shops.map(mapApiShop);
    return { shops: mapped, total: count ?? mapped.length };
  }

  async toggleTracked(shopId: string): Promise<void> {
    await apiFetch(`/api/shops/${encodeURIComponent(shopId)}/track`, { method: "POST" });
  }

  async getById(shopId: string): Promise<Shop | null> {
    try {
      const { shops } = await apiFetch<ShopsResponse>(`/api/shops/${encodeURIComponent(shopId)}`);
      return shops[0] ? mapApiShop(shops[0]) : null;
    } catch {
      // The backend answers an unknown shop id with a 404, which apiFetch
      // turns into a throw — but "no such shop" is a value here, not a
      // failure (ShopDetailPage renders "not found" for null).
      return null;
    }
  }

  async getTracked(): Promise<Shop[]> {
    const { shops } = await apiFetch<ShopsResponse>("/api/shops/tracked");
    return shops.map(mapApiShop);
  }
}

export const httpShopsRepository: ShopsRepository = new HttpShopsRepository();
