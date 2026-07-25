export interface Shop {
  id: string;
  initials: string;
  name: string;
  listings: number;
  ageMonths: number;
  niche: string;
  sales: string;
  revenue: string;
  rating: number;
  reviews: string;
  growth: string;
  tracked: boolean;
}

export type ShopFilter = "top" | "growing" | "podTrend" | "similar";
