export interface Listing {
  id: string;
  title: string;
  /** Id of the shop this listing belongs to — always a real record in
   *  shopsRepository, so "the shop this listing is from" is always a
   *  valid /shops/:shopId link, never just a display-only name. */
  shopId: string;
  shopName: string;
  views: string;
  sales: string;
  revenue: string;
  ageMonths: number;
  tags: string[];
  tracked: boolean;
  thumbGradient: [string, string];
}

export type ListingFilter = "top" | "new" | "trending" | "outliers";
