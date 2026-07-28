/* Real ShopsRepository implementation, backed by the Flask API
   (controllers/shops_controller.py) instead of mock data. Default repository
   for both ShopsPage and ShopDetailPage.

   The detail page's blocks Etsy has no data for (revenue, the sales trend,
   the price distribution, the rating histogram, reviews, the shop's own
   listings) are not faked here - they render explicit TODO states keyed to
   their issues. See ShopDetailView.tsx and shopTodoIssues.ts. */

import { ApiError, apiFetch } from "../../shared/api";
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
    // Etsy shop ids are always numeric, and the Flask route is registered as
    // <int:shop_id>. A non-numeric id therefore can never resolve - it's a
    // mock id (the dashboard's "ct"/"vg"/...) or a typo'd URL - and letting
    // it through produces Flask's own HTML 404, which apiFetch (correctly,
    // for a genuinely absent route) reports as "перезапусти python3 app.py"
    // on a perfectly healthy server. Answering "not found" here is the
    // truthful result; this is id validation, not swallowing an error. Same
    // guard as httpListingsRepository.getDetailById.
    if (!/^\d+$/.test(shopId)) return null;

    try {
      const { shops } = await apiFetch<ShopsResponse>(`/api/shops/${encodeURIComponent(shopId)}`);
      return shops[0] ? mapApiShop(shops[0]) : null;
    } catch (e) {
      // "No such shop" is a value here, not a failure - the page renders
      // "не знайдено" for null. Everything else must keep propagating so it
      // reaches an ErrorNotice: a missing Etsy key, a rate limit and a dead
      // connection all arrive here too, and answering them with `null` would
      // report them as "магазин не знайдено".
      //
      // Only the API's *own* 404 means the record is missing. A 404 the app
      // inferred is the route being absent (a Flask process running old
      // code), which is a broken setup, not an unknown shop.
      if (e instanceof ApiError && e.status === 404 && e.apiReported) return null;
      throw e;
    }
  }

  async getTracked(): Promise<Shop[]> {
    const { shops } = await apiFetch<ShopsResponse>("/api/shops/tracked");
    return shops.map(mapApiShop);
  }
}

export const httpShopsRepository: ShopsRepository = new HttpShopsRepository();
