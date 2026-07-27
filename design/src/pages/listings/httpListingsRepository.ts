/* Real ListingsRepository implementation, backed by the Flask API
   (controllers/listings_controller.py) instead of mock data. This is
   ListingsPage's default repository. ListingDetailPage still defaults to
   mockListingsRepository (see listingsRepository.ts) - its detail view
   depends on several mock-only fields (SEO checklist, similar listings,
   tags audit) with no backend equivalent yet, which is also why
   ListingsPage renders its rows non-navigable against this repository. */

import { apiFetch } from "../../shared/api";
import { mapApiListing, type ApiListing } from "./listingMapper";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing } from "./types";

class HttpListingsRepository implements ListingsRepository {
  async search(query: string): Promise<Listing[]> {
    if (query.trim()) {
      // Re-posting the same query is cheap: EtsyApiListingSource.search()
      // short-circuits when the keywords haven't changed, so this doesn't
      // invalidate the page cache and force a fresh Etsy round trip.
      await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
    }
    const { listings } = await apiFetch<{ listings: ApiListing[] }>("/api/listings");
    return listings.map(mapApiListing);
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

  async getTracked(): Promise<Listing[]> {
    const { listings } = await apiFetch<{ listings: ApiListing[] }>("/api/tracked");
    return listings.map(mapApiListing);
  }
}

export const httpListingsRepository: ListingsRepository = new HttpListingsRepository();
