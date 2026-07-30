/* Real ShopsRepository implementation, backed by the Flask API
   (controllers/shops_controller.py) instead of mock data. Default repository
   for both ShopsPage and ShopDetailPage.

   The detail page's blocks Etsy has no data for (revenue, the sales trend,
   the price distribution, the rating histogram, reviews, the shop's own
   listings) are not faked here - they render explicit TODO states keyed to
   their issues. See ShopDetailView.tsx and shopTodoIssues.ts. */

import { ApiError, apiFetch } from "../../shared/api";
import { mapApiSalesHistory, mapApiShop, type ApiSalesHistory, type ApiShop } from "./shopMapper";
import type { ShopSearchResult, ShopsRepository } from "./shopsRepository";
import type { SalesHistory, Shop } from "./types";

interface ShopsResponse {
  shops: ApiShop[];
  count?: number;
}

class HttpShopsRepository implements ShopsRepository {
  /** Etsy looks shops up by name only — no listing, no ranking by
   *  sales/rating/age (models/etsy_api_shop_source.py) — so an empty query has
   *  nothing to ask for. Rows arrive in name-relevance order. */
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
    // The Flask route is <int:shop_id>, so a non-numeric id (a mock "ct", a
    // typo'd URL) can never resolve. Letting it through produces Flask's HTML
    // 404, reported as "перезапусти python3 app.py" on a healthy server. Id
    // validation, not a swallowed error — same guard as the listings side.
    if (!/^\d+$/.test(shopId)) return null;

    try {
      const { shops } = await apiFetch<ShopsResponse>(`/api/shops/${encodeURIComponent(shopId)}`);
      return shops[0] ? mapApiShop(shops[0]) : null;
    } catch (e) {
      // "No such shop" is a value, not a failure. Everything else must keep
      // propagating to an ErrorNotice — a missing key, a rate limit and a
      // dead connection all land here, and `null` would report them as
      // "магазин не знайдено". Only the API's *own* 404 means the record is
      // missing; an inferred one is a stale Flask process.
      if (e instanceof ApiError && e.status === 404 && e.apiReported) return null;
      throw e;
    }
  }

  async getTracked(): Promise<Shop[]> {
    const { shops } = await apiFetch<ShopsResponse>("/api/shops/tracked");
    return shops.map(mapApiShop);
  }

  async getSalesHistory(shopId: string): Promise<SalesHistory | null> {
    // Same id guard and same 404 reasoning as getById above: the route is
    // <int:shop_id>, and only the API's own 404 means "no estimate" — an
    // inferred one is a stale Flask process and has to keep propagating.
    if (!/^\d+$/.test(shopId)) return null;
    try {
      const raw = await apiFetch<ApiSalesHistory>(
        `/api/shops/${encodeURIComponent(shopId)}/sales-history`,
      );
      return mapApiSalesHistory(raw);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.apiReported) return null;
      throw e;
    }
  }
}

export const httpShopsRepository: ShopsRepository = new HttpShopsRepository();
