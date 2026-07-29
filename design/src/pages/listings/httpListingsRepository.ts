/* Real ListingsRepository implementation, backed by the Flask API
   (controllers/listings_controller.py) instead of mock data. This is the
   default repository for both ListingsPage and ListingDetailPage.

   The detail page's blocks that Etsy has no data for (Listing Score, tag
   volume/KD, SEO checklist, similar listings) are not faked here - they
   render explicit TODO states keyed to their issues. See
   ListingDetailView.tsx. */

import { ApiError, apiFetch } from "../../shared/api";
import {
  mapApiListing,
  mapApiListingDetail,
  type ApiListing,
  type ApiListingDetail,
} from "./listingMapper";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing, ListingDetail } from "./types";

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

  async getDetailById(listingId: string): Promise<ListingDetail | null> {
    // Etsy listing ids are always numeric, and the Flask route is registered
    // as <int:lid>. A non-numeric id therefore can never resolve - it's a
    // mock id or a typo'd URL - and letting it through produces Flask's own
    // HTML 404, which apiFetch (correctly, for a genuinely absent route)
    // reports as "перезапусти python3 app.py". Answering "not found" here is
    // the truthful result; this is id validation, not swallowing an error.
    if (!/^\d+$/.test(listingId)) return null;

    try {
      const { listings } = await apiFetch<{ listings: ApiListingDetail[] }>(
        `/api/listings/${encodeURIComponent(listingId)}`,
      );
      return listings[0] ? mapApiListingDetail(listings[0]) : null;
    } catch (e) {
      // Only the API's *own* 404 means "no such listing". An inferred 404 -
      // Flask not knowing the route at all - means a stale server, i.e. a
      // broken setup, and must surface as an error instead of being
      // reported to the user as a listing that doesn't exist. Same fix as
      // HttpShopsRepository.getById (commit 35c5195).
      if (e instanceof ApiError && e.status === 404 && e.apiReported) return null;
      throw e;
    }
  }

  async getSimilar(listingId: string): Promise<{ query: string; items: Listing[] }> {
    // Same numeric-id guard as getDetailById, for the same reason.
    if (!/^\d+$/.test(listingId)) return { query: "", items: [] };
    try {
      const { listings, query } = await apiFetch<{ listings: ApiListing[]; query: string }>(
        `/api/listings/${encodeURIComponent(listingId)}/similar`,
      );
      return { query, items: listings.map(mapApiListing) };
    } catch (e) {
      // The API's own 404 means the listing itself is gone — an empty
      // carousel, not an error banner on a page that otherwise rendered.
      // An inferred 404 (stale Flask, route not registered) still throws.
      if (e instanceof ApiError && e.status === 404 && e.apiReported) {
        return { query: "", items: [] };
      }
      throw e;
    }
  }

  async getTracked(): Promise<Listing[]> {
    const { listings } = await apiFetch<{ listings: ApiListing[] }>("/api/tracked");
    return listings.map(mapApiListing);
  }
}

export const httpListingsRepository: ListingsRepository = new HttpListingsRepository();
