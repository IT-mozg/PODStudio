/* Same Dependency-Inversion shape as shopsRepository.ts / listingsRepository.ts.
   The one addition: search() also returns a headline + 12-month trend for
   whatever term was typed, generated deterministically from the query
   string so any keyword the user types gets plausible (stable, not
   flickering) stats — the same feel as a real keyword tool, without a
   real API behind it yet. */

import type { TrendPoint } from "../../shared/components/TrendChart";
import { seedFromString, mulberry32 } from "../../shared/prng";
import type { Keyword, KeywordFilter, KeywordSearchResult } from "./types";

export interface KeywordsRepository {
  search(query: string, filter: KeywordFilter): Promise<KeywordSearchResult>;
  toggleTracked(keywordId: string): Promise<void>;
  getTracked(): Promise<Keyword[]>;
}

const MOCK_KEYWORDS: Omit<Keyword, "sparkline">[] = [
  { id: "k1", text: "funny cat shirt", searchVolume: "734,338", competition: "3,307,387", kd: 89, tracked: true },
  { id: "k2", text: "funny shirts", searchVolume: "753,775", competition: "3,292,697", kd: 90, tracked: false },
  { id: "k3", text: "funny tee shirts for adults", searchVolume: "715,504", competition: "2,361,154", kd: 94, tracked: false },
  { id: "k4", text: "dog mom gift", searchVolume: "241,600", competition: "980,220", kd: 62, tracked: false },
  { id: "k5", text: "retro surf van sunset", searchVolume: "58,900", competition: "142,880", kd: 41, tracked: false },
  { id: "k6", text: "minimalist line art print", searchVolume: "112,300", competition: "398,410", kd: 55, tracked: false },
  { id: "k7", text: "coffee lover mug", searchVolume: "97,150", competition: "265,940", kd: 48, tracked: false },
];

const MONTH_LABELS = ["Сер", "Вер", "Жов", "Лис", "Гру", "Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип"];

function buildSparkline(seedText: string, points = 14): number[] {
  const rand = mulberry32(seedFromString(`spark:${seedText.toLowerCase().trim()}`));
  let value = 30 + rand() * 40;
  return Array.from({ length: points }, () => {
    value = Math.max(5, Math.min(100, value + (rand() - 0.5) * 24));
    return Math.round(value);
  });
}

function buildHeadlineAndTrend(query: string): { headline: KeywordSearchResult["headline"]; trend: TrendPoint[] } {
  const rand = mulberry32(seedFromString(query.toLowerCase().trim() || "pod studio"));
  const baseVolume = 8_000 + Math.floor(rand() * 700_000);
  const peakMonth = Math.floor(rand() * 12);

  const trend: TrendPoint[] = MONTH_LABELS.map((label, i) => {
    const distanceFromPeak = Math.min(Math.abs(i - peakMonth), 12 - Math.abs(i - peakMonth));
    const seasonal = Math.max(0.3, 1 - distanceFromPeak / 7);
    const noise = 0.85 + rand() * 0.3;
    return { label, value: Math.round(baseVolume * seasonal * noise) };
  });

  const competition = Math.round(baseVolume * (2.5 + rand() * 2));
  const kd = Math.round(40 + rand() * 55);
  const score = Math.max(5, Math.round(100 - kd + rand() * 10));

  return {
    headline: {
      searchVolume: baseVolume.toLocaleString("uk-UA"),
      competition: competition.toLocaleString("uk-UA"),
      kd,
      score,
    },
    trend,
  };
}

class MockKeywordsRepository implements KeywordsRepository {
  private keywords: Keyword[] = MOCK_KEYWORDS.map((k) => ({ ...k, sparkline: buildSparkline(k.text) }));

  async search(query: string, _filter: KeywordFilter): Promise<KeywordSearchResult> {
    const needle = query.trim().toLowerCase();
    const similar = needle
      ? this.keywords.filter((k) => k.text.toLowerCase().includes(needle) || needle.includes(k.text.toLowerCase()))
      : this.keywords;

    const { headline, trend } = buildHeadlineAndTrend(query);

    return {
      headline,
      trend,
      similar: similar.map((k) => ({ ...k })),
    };
  }

  async toggleTracked(keywordId: string): Promise<void> {
    const kw = this.keywords.find((k) => k.id === keywordId);
    if (kw) kw.tracked = !kw.tracked;
  }

  async getTracked(): Promise<Keyword[]> {
    return this.keywords.filter((k) => k.tracked).map((k) => ({ ...k }));
  }
}

export const mockKeywordsRepository: KeywordsRepository = new MockKeywordsRepository();
