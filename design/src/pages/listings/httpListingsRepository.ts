/* Real ListingsRepository implementation, backed by the Flask API
   (controllers/listings_controller.py) instead of mock data. This is
   ListingsPage's default repository. ListingDetailPage still defaults to
   mockListingsRepository (see listingsRepository.ts) - its detail view
   depends on several mock-only fields (SEO checklist, similar listings,
   tags audit) with no backend equivalent yet. */

import { parseCount } from "../../shared/money";
import { mapApiListing, type ApiListing } from "./listingMapper";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing, ListingFilter } from "./types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `${path} failed (${res.status})`);
  return body as T;
}

/** Flask has no server-side notion of these filter chips today (no sort
 *  param on /api/listings, and container.listings_payload() doesn't even
 *  read the is_popular()/is_hot() badges it computes - see
 *  etsy_api_listing_source.py). These are client-side approximations over
 *  whatever real fields the payload does have, not the product-defined
 *  semantics for each chip - a real implementation needs either a backend
 *  sort or a product decision on what each chip should mean. */
function applyFilter(listings: Listing[], filter: ListingFilter): Listing[] {
  const sorted = [...listings];
  switch (filter) {
    case "top":
      return sorted.sort((a, b) => parseCount(b.sales) - parseCount(a.sales));
    case "new":
      return sorted.sort((a, b) => a.ageMonths - b.ageMonths);
    case "trending":
      return sorted.sort((a, b) => parseCount(b.views) - parseCount(a.views));
    case "outliers":
      return sorted.sort((a, b) => parseCount(a.views) - parseCount(b.views));
  }
}

class HttpListingsRepository implements ListingsRepository {
  async search(query: string, filter: ListingFilter): Promise<Listing[]> {
    if (query.trim()) {
      await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    }
    const { listings } = await apiFetch<{ listings: ApiListing[] }>("/api/listings");
    return applyFilter(listings.map(mapApiListing), filter);
  }

  async toggleTracked(listingId: string): Promise<void> {
    await apiFetch(`/api/listings/${encodeURIComponent(listingId)}/track`, { method: "POST" });
  }

  async getById(listingId: string): Promise<Listing | null> {
    const { listings } = await apiFetch<{ listings: ApiListing[] }>(
      `/api/listing-info?lids=${encodeURIComponent(listingId)}`,
    );
    return listings[0] ? mapApiListing(listings[0]) : null;
  }
}

export const httpListingsRepository: ListingsRepository = new HttpListingsRepository();
