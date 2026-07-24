import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { SearchBar } from "../../shared/components/SearchBar";
import { FilterChips, type FilterOption } from "../../shared/components/FilterChips";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { AlertCircleIcon, DesignsIcon, StarIcon, TrendUpIcon } from "../../shared/icons";
import { mockListingsRepository, type ListingsRepository } from "./listingsRepository";
import type { Listing, ListingFilter } from "./types";
import { ListingsTable } from "./ListingsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

const FILTERS: FilterOption<ListingFilter>[] = [
  { id: "top", label: "Топ продажів", icon: StarIcon },
  { id: "new", label: "Нові", icon: DesignsIcon },
  { id: "trending", label: "В тренді", icon: TrendUpIcon },
  { id: "outliers", label: "Викиди", icon: AlertCircleIcon },
];

type ListingsTab = "search" | "tracked";

interface ListingsPageProps {
  /** Defaults to the in-memory mock — same swap-in-a-real-repository
   *  shape as ShopsPage. */
  repository?: ListingsRepository;
}

export function ListingsPage({ repository = mockListingsRepository }: ListingsPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ListingsTab>("search");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListingFilter>("top");
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    repository.search(query, filter).then(setListings);
  }, [repository, query, filter]);

  async function handleToggleTracked(listingId: string) {
    await repository.toggleTracked(listingId);
    setListings(await repository.search(query, filter));
  }

  const trackedListings = useMemo(() => listings.filter((l) => l.tracked), [listings]);

  return (
    <div>
      <PageHeader title="Лістинги" subtitle="Аналізуйте будь-який лістинг конкурента або відстежуйте власні" />

      <SegTabs
        tabs={[
          { id: "search", label: "Пошук" },
          { id: "tracked", label: "Відстежувані", badge: trackedListings.length },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "search" && (
        <>
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={() => repository.search(query, filter).then(setListings)}
            placeholder="Назва товару або ключове слово — напр. funny cat shirt"
          />
          <FilterChips options={FILTERS} active={filter} onSelect={setFilter} />

          <ResultsToolbar label="Проаналізовано лістингів" value="58 200 000" />
          <div className={styles.tableWrap}>
            <ListingsTable listings={listings} onToggleTracked={handleToggleTracked} onSelectListing={(l) => navigate(`/listings/${l.id}`)} />
          </div>
        </>
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${trackedListings.length} лістинг(и)`} />
          <div className={styles.tableWrap}>
            <ListingsTable listings={trackedListings} onToggleTracked={handleToggleTracked} onSelectListing={(l) => navigate(`/listings/${l.id}`)} />
          </div>
        </>
      )}
    </div>
  );
}
