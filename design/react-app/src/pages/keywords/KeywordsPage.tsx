import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { SearchBar } from "../../shared/components/SearchBar";
import { FilterChips, type FilterOption } from "../../shared/components/FilterChips";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { SectionHead } from "../../shared/components/SectionHead";
import { PanelCard } from "../../shared/components/PanelCard";
import { StatGrid, type StatDatum } from "../../shared/components/StatGrid";
import { TrendChart, type TrendPoint } from "../../shared/components/TrendChart";
import { AlertCircleIcon, GridSquaresIcon, SearchIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { mockKeywordsRepository, type KeywordsRepository } from "./keywordsRepository";
import type { Keyword, KeywordFilter, KeywordSearchResult } from "./types";
import { KeywordsTable } from "./KeywordsTable";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import styles from "./KeywordsPage.module.css";

const FILTERS: FilterOption<KeywordFilter>[] = [
  { id: "top", label: "Топ за обсягом", icon: StarIcon },
  { id: "lowCompetition", label: "Низька конкуренція", icon: GridSquaresIcon },
  { id: "growing", label: "Швидко ростуть", icon: TrendUpIcon },
  { id: "longTail", label: "Довгий хвіст", icon: SearchIcon },
];

type KeywordsTab = "search" | "tracked";

function buildHeadlineStats(headline: KeywordSearchResult["headline"]): StatDatum[] {
  return [
    { id: "volume", icon: SearchIcon, value: headline.searchVolume, label: "Обсяг пошуку / міс.", delta: { text: "Etsy, США", tone: "neutral" } },
    { id: "competition", icon: GridSquaresIcon, value: headline.competition, label: "Конкуруючих лістингів", delta: { text: "на цей запит", tone: "neutral" } },
    {
      id: "kd",
      icon: AlertCircleIcon,
      value: `${headline.kd}/100`,
      label: "Складність (KD)",
      delta: { text: headline.kd < 50 ? "легко пробитись" : "висока конкуренція", tone: headline.kd < 50 ? "up" : "warn" },
    },
    {
      id: "score",
      icon: TrendUpIcon,
      value: `${headline.score}/100`,
      label: "Оцінка можливості",
      delta: { text: headline.score >= 60 ? "варто спробувати" : "низький потенціал", tone: headline.score >= 60 ? "up" : "warn" },
    },
  ];
}

interface KeywordsPageProps {
  repository?: KeywordsRepository;
}

export function KeywordsPage({ repository = mockKeywordsRepository }: KeywordsPageProps) {
  const [tab, setTab] = useState<KeywordsTab>("search");
  const [query, setQuery] = useState("funny cat shirt");
  const [filter, setFilter] = useState<KeywordFilter>("top");
  const [result, setResult] = useState<KeywordSearchResult | null>(null);
  const [trackedKeywords, setTrackedKeywords] = useState<Keyword[]>([]);
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    repository.search(debouncedQuery, filter).then(setResult);
  }, [repository, debouncedQuery, filter]);

  useEffect(() => {
    repository.getTracked().then(setTrackedKeywords);
  }, [repository, result]);

  async function runSearch() {
    setResult(await repository.search(query, filter));
  }

  const handleToggleTracked = useCallback(
    async (keywordId: string) => {
      await repository.toggleTracked(keywordId);
      setResult(await repository.search(query, filter));
      setTrackedKeywords(await repository.getTracked());
    },
    [repository, query, filter]
  );

  const headlineStats = useMemo(() => (result ? buildHeadlineStats(result.headline) : []), [result]);

  return (
    <div>
      <PageHeader title="Ключові слова" subtitle="Обсяг пошуку, конкуренція й тренд для будь-якого запиту — введіть слово, щоб отримати статистику" />

      <SegTabs
        tabs={[
          { id: "search", label: "Пошук" },
          { id: "tracked", label: "Відстежувані", badge: trackedKeywords.length },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "search" && (
        <>
          <SearchBar value={query} onChange={setQuery} onSubmit={runSearch} placeholder="Ключове слово — напр. funny cat shirt" submitLabel="Шукати" />
          <FilterChips options={FILTERS} active={filter} onSelect={setFilter} />

          {result && (
            <>
              <StatGrid stats={headlineStats} />

              <SectionHead icon={TrendUpIcon} title={`Тренд пошуку — «${query || "…"}»`} />
              <PanelCard>
                <div className={styles.chartCard}>
                  <TrendChart data={result.trend as TrendPoint[]} formatValue={(v) => v.toLocaleString("uk-UA")} />
                </div>
              </PanelCard>

              <ResultsToolbar label="Схожі ключові слова" value={String(result.similar.length)} />
              <div className={searchStyles.tableWrap}>
                <KeywordsTable keywords={result.similar} onToggleTracked={handleToggleTracked} />
              </div>
            </>
          )}
        </>
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${trackedKeywords.length} ключових слів`} />
          <div className={searchStyles.tableWrap}>
            <KeywordsTable keywords={trackedKeywords} onToggleTracked={handleToggleTracked} />
          </div>
        </>
      )}
    </div>
  );
}
