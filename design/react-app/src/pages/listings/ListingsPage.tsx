import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { mockListingsRepository, type ListingsRepository } from "./listingsRepository";
import type { Listing, ListingFilter } from "./types";
import { ListingsSearchPanel } from "./ListingsSearchPanel";
import { ListingsTable } from "./ListingsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

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
  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    repository.search(debouncedQuery, filter).then(setListings);
  }, [repository, debouncedQuery, filter]);

  const handleToggleTracked = useCallback(
    async (listingId: string) => {
      await repository.toggleTracked(listingId);
      setListings(await repository.search(query, filter));
    },
    [repository, query, filter]
  );

  const handleSelectListing = useCallback((listing: Listing) => navigate(`/listings/${listing.id}`), [navigate]);

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
        <ListingsSearchPanel
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={() => repository.search(query, filter).then(setListings)}
          searchPlaceholder="Назва товару або ключове слово — напр. funny cat shirt"
          filter={filter}
          onFilterChange={setFilter}
          resultsLabel="Проаналізовано лістингів"
          resultsValue="58 200 000"
          listings={listings}
          onToggleTracked={handleToggleTracked}
          onSelectListing={handleSelectListing}
        />
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${trackedListings.length} лістинг(и)`} />
          <div className={styles.tableWrap}>
            <ListingsTable listings={trackedListings} onToggleTracked={handleToggleTracked} onSelectListing={handleSelectListing} />
          </div>
        </>
      )}
    </div>
  );
}
