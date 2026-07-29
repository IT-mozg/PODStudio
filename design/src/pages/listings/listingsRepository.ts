/* Same Dependency-Inversion shape as shopsRepository.ts: ListingsPage
   depends only on this interface. Swap in a real Etsy-API-backed
   implementation later without touching any component. */

import { parseCount } from "../../shared/money";
import type { Listing, ListingDetail } from "./types";

export interface ListingsRepository {
  /** Sorting by the filter chips is the caller's job (see
   *  listingFilters.ts's sortListings) — no implementation has a
   *  server-side sort, and doing it here would make a chip click cost a
   *  network round trip. */
  search(query: string): Promise<Listing[]>;
  toggleTracked(listingId: string): Promise<void>;
  getById(listingId: string): Promise<Listing | null>;
  /** Everything the detail page needs — a superset of getById's Listing.
   *  Separate method rather than a fatter Listing because the backend
   *  serves them from separate endpoints on purpose: the search grid must
   *  not carry 78 descriptions it never renders. */
  getDetailById(listingId: string): Promise<ListingDetail | null>;
  /** Listings similar to this one, for the detail page's carousel (#86).
   *  Deliberately not expressed as search(): search() repoints the backend's
   *  shared listing source and wipes its page cache, so calling it from the
   *  detail page would reset the grid the user came from. `query` is the
   *  criterion actually used, and the UI has to show it — Etsy has no
   *  similar/recommended endpoint, so this is a second keyword search and
   *  must not be presented as anything more. */
  getSimilar(listingId: string): Promise<{ query: string; items: Listing[] }>;
  /** Every tracked listing, independent of the current search — a
   *  bookmark outlives the query it was made under, so this can't be a
   *  filter over the last search's results. */
  getTracked(): Promise<Listing[]>;
}

const MOCK_LISTINGS: Listing[] = [
  { id: "l1", title: "Funny cat vintage tee", shopId: "ct", shopName: "CatTeesShop", views: "987,976", sales: "12,942", revenue: "$198.1k", ageMonths: 38, tags: ["funny cat", "t-shirt"], tracked: true, thumbUrl: "", thumbGradient: ["#ff9a5a", "#e0653f"] },
  { id: "l2", title: "Retro surf van sunset poster", shopId: "vg", shopName: "VintageGlowPrints", views: "120,696", sales: "50,287", revenue: "$420k", ageMonths: 64, tags: ["retro", "wall art"], tracked: false, thumbUrl: "", thumbGradient: ["#7c6cff", "#5b4bdb"] },
  { id: "l3", title: "Dog mom era typography sweatshirt", shopId: "kk", shopName: "KrispKiwiStudio", views: "18,163", sales: "1,245", revenue: "$29.4k", ageMonths: 21, tags: ["dog mom", "sweatshirt"], tracked: false, thumbUrl: "", thumbGradient: ["#4ade80", "#22916a"] },
  { id: "l4", title: "Minimalist mountain line art print", shopId: "os", shopName: "OldSchoolCulture", views: "3,912", sales: "287", revenue: "$6.1k", ageMonths: 12, tags: ["minimalist", "line art"], tracked: false, thumbUrl: "", thumbGradient: ["#f472b6", "#c2418e"] },
  { id: "l5", title: "Coffee lover mug — custom name", shopId: "mv", shopName: "MugvoyageCo", views: "45,230", sales: "3,108", revenue: "$36.7k", ageMonths: 29, tags: ["coffee", "mug", "personalized"], tracked: false, thumbUrl: "", thumbGradient: ["#ef7c4a", "#b3552c"] },
];

class MockListingsRepository implements ListingsRepository {
  private listings = MOCK_LISTINGS.map((l) => ({ ...l }));

  async search(query: string): Promise<Listing[]> {
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

  async getTracked(): Promise<Listing[]> {
    return this.listings.filter((l) => l.tracked).map((l) => ({ ...l }));
  }

  async getById(listingId: string): Promise<Listing | null> {
    return this.resolve(listingId);
  }

  /** Mirrors the backend's rule (container.similar_query): the query is the
   *  opening of the title, and every other fixture is a candidate. Sorted
   *  the same way the route sorts — by the sales estimate, descending. */
  async getSimilar(listingId: string): Promise<{ query: string; items: Listing[] }> {
    const listing = await this.resolve(listingId);
    if (!listing) return { query: "", items: [] };
    const query = listing.title.split(" ").slice(0, 3).join(" ");
    const items = this.listings
      .filter((l) => l.id !== listingId)
      .map((l) => ({ ...l }))
      .sort((a, b) => parseCount(b.sales) - parseCount(a.sales));
    return { query, items };
  }

  /** Demo detail data, written out by hand rather than generated. The
   *  previous version ran a seeded PRNG over the listing to invent a
   *  description, photos, price and attributes; that is exactly what #78
   *  removed, so the mock must not reintroduce it — a demo fixture is
   *  honest, a plausible random number is not. */
  async getDetailById(listingId: string): Promise<ListingDetail | null> {
    const listing = await this.resolve(listingId);
    if (!listing) return null;
    return {
      ...listing,
      description:
        "Демонстраційний опис лістинга. Проти реального бекенду сюди " +
        "приходить справжній текст із Etsy.",
      price: "$24.99",
      // Derived from this fixture's own views/age, not a constant — a fixed
      // number contradicted the "N міс. · M переглядів" line above it.
      viewsPerMonth: (listing.ageMonths && listing.ageMonths >= 1
        ? Math.round(parseCount(listing.views) / listing.ageMonths)
        : parseCount(listing.views)
      ).toLocaleString("uk-UA"),
      // No real imagery in the mock data — the detail view renders its
      // placeholder tile when this is empty.
      photos: [],
      attributes: [
        { label: "Категорія", value: "Clothing → Tops & Tees → T-shirts" },
        { label: "Хто зробив", value: "Продавець" },
        { label: "Коли зроблено", value: "На замовлення" },
        { label: "Матеріали", value: null },
        { label: "Стиль", value: null },
        { label: "Час обробки", value: "1–3 роб. дн." },
        { label: "Персоналізація", value: "Немає" },
        { label: "Варіанти", value: "Є" },
        { label: "Виробничі партнери", value: null },
      ],
      etsyUrl: `https://www.etsy.com/listing/${listing.id}`,
      favorites: "412",
      // What models/conversion_rate.py actually returns for the $24.99 above
      // (the [20, 25) bucket), so the mock stays consistent with the model
      // rather than inventing a nicer-looking number.
      convRate: "≈ 2,07%",
    };
  }

  /** There used to be a second branch here, resolving shop-scoped ids like
   *  "ct-l0" by regenerating a shop's listings from shopDetail.ts's PRNG.
   *  #8 deleted that generator, and with it the only source of such ids. */
  private async resolve(listingId: string): Promise<Listing | null> {
    const listing = this.listings.find((l) => l.id === listingId);
    return listing ? { ...listing } : null;
  }
}

export const mockListingsRepository: ListingsRepository = new MockListingsRepository();
