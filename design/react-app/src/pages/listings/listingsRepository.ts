/* Same Dependency-Inversion shape as shopsRepository.ts: ListingsPage
   depends only on this interface. Swap in a real Etsy-API-backed
   implementation later without touching any component. */

import type { Listing, ListingFilter } from "./types";

export interface ListingsRepository {
  search(query: string, filter: ListingFilter): Promise<Listing[]>;
  toggleTracked(listingId: string): Promise<void>;
}

const MOCK_LISTINGS: Listing[] = [
  { id: "l1", title: "Funny cat vintage tee", shopName: "CatTeesShop", views: "987,976", sales: "12,942", revenue: "$198.1k", ageMonths: 38, tags: ["funny cat", "t-shirt"], tracked: true, thumbGradient: ["#ff9a5a", "#e0653f"] },
  { id: "l2", title: "Retro surf van sunset poster", shopName: "VintageGlowPrints", views: "120,696", sales: "50,287", revenue: "$420k", ageMonths: 64, tags: ["retro", "wall art"], tracked: false, thumbGradient: ["#7c6cff", "#5b4bdb"] },
  { id: "l3", title: "Dog mom era typography sweatshirt", shopName: "KrispKiwiStudio", views: "18,163", sales: "1,245", revenue: "$29.4k", ageMonths: 21, tags: ["dog mom", "sweatshirt"], tracked: false, thumbGradient: ["#4ade80", "#22916a"] },
  { id: "l4", title: "Minimalist mountain line art print", shopName: "OldSchoolCulture", views: "3,912", sales: "287", revenue: "$6.1k", ageMonths: 12, tags: ["minimalist", "line art"], tracked: false, thumbGradient: ["#f472b6", "#c2418e"] },
  { id: "l5", title: "Coffee lover mug — custom name", shopName: "MugvoyageCo", views: "45,230", sales: "3,108", revenue: "$36.7k", ageMonths: 29, tags: ["coffee", "mug", "personalized"], tracked: false, thumbGradient: ["#ef7c4a", "#b3552c"] },
];

class MockListingsRepository implements ListingsRepository {
  private listings = MOCK_LISTINGS.map((l) => ({ ...l }));

  async search(query: string, _filter: ListingFilter): Promise<Listing[]> {
    const needle = query.trim().toLowerCase();
    const matches = needle ? this.listings.filter((l) => l.title.toLowerCase().includes(needle)) : this.listings;
    // Return fresh copies so React always sees a new reference (see the
    // note in shopsRepository.ts — returning the same array silently
    // drops updates like a star toggle when query/filter don't change).
    return matches.map((l) => ({ ...l }));
  }

  async toggleTracked(listingId: string): Promise<void> {
    const listing = this.listings.find((l) => l.id === listingId);
    if (listing) listing.tracked = !listing.tracked;
  }
}

export const mockListingsRepository: ListingsRepository = new MockListingsRepository();
