import type { TrendPoint } from "../../shared/components/TrendChart";

export interface Keyword {
  id: string;
  text: string;
  searchVolume: string;
  competition: string;
  kd: number;
  /** 14-point mini trend, newest last — drives the row's Sparkline. */
  sparkline: number[];
  tracked: boolean;
}

export type KeywordFilter = "top" | "lowCompetition" | "growing" | "longTail";

export interface KeywordSearchResult {
  headline: {
    searchVolume: string;
    competition: string;
    kd: number;
    score: number;
  };
  trend: TrendPoint[];
  similar: Keyword[];
}
