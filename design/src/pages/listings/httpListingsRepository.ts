/* The live ListingsRepository, backed by controllers/listings_controller.py.
   Default for both ListingsPage and ListingDetailPage.

   Blocks Etsy has no data for are never faked here — they render TODO states
   keyed to their issues. See ListingDetailView.tsx. */

import { ApiError, apiFetch, HTTP_NOT_FOUND } from "../../shared/api";
import {
  mapApiListing,
  mapApiListingDetail,
  type ApiListing,
  type ApiListingDetail,
} from "./listingMapper";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing, ListingDetail } from "./types";

/** Etsy listing ids are always numeric. */
const NUMERIC_ID = /^\d+$/;

class HttpListingsRepository implements ListingsRepository {
  async search(query: string): Promise<Listing[]> {
    if (query.trim()) {
      // Cheap to repeat: EtsyApiListingSource.search() short-circuits on an
      // unchanged query, so the page cache survives.
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
    // The Flask route is <int:lid>, so a non-numeric id can never resolve.
    // Letting it through produces Flask's HTML 404, which apiFetch reports as
    // "перезапусти python3 app.py". This is id validation, not a swallowed
    // error.
    if (!NUMERIC_ID.test(listingId)) return null;

    try {
      const { listings } = await apiFetch<{ listings: ApiListingDetail[] }>(
        `/api/listings/${encodeURIComponent(listingId)}`,
      );
      return listings[0] ? mapApiListingDetail(listings[0]) : null;
    } catch (e) {
      // Only the API's *own* 404 means "no such listing". An inferred one is
      // a stale Flask process — a broken setup, not a missing record.
      if (e instanceof ApiError && e.status === HTTP_NOT_FOUND && e.apiReported) return null;
      throw e;
    }
  }

  async getSimilar(listingId: string): Promise<{ query: string; items: Listing[] }> {
    // Same guard as getDetailById, for the same reason.
    if (!NUMERIC_ID.test(listingId)) return { query: "", items: [] };
    try {
      const { listings, query } = await apiFetch<{ listings: ApiListing[]; query: string }>(
        `/api/listings/${encodeURIComponent(listingId)}/similar`,
      );
      return { query, items: listings.map(mapApiListing) };
    } catch (e) {
      // The API's own 404 means the listing is gone — an empty carousel, not
      // an error banner on a page that otherwise rendered.
      if (e instanceof ApiError && e.status === HTTP_NOT_FOUND && e.apiReported) {
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
