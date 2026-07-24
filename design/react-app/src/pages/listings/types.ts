export interface Listing {
  id: string;
  title: string;
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
