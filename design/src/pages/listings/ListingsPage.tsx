import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { httpListingsRepository } from "./httpListingsRepository";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing, ListingFilter } from "./types";
import { ListingsSearchPanel } from "./ListingsSearchPanel";
import { ListingsTable } from "./ListingsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

type ListingsTab = "search" | "tracked";

/** Etsy's search API has no "show everything" query - an empty string
 *  isn't a valid request - so the page needs a real keyword to search on
 *  first load, before the user types anything. */
const DEFAULT_QUERY = "t-shirt";

interface ListingsPageProps {
  /** Defaults to the real Etsy-backed repository. Pass mockListingsRepository
   *  to fall back to the fixed 5-row demo data. */
  repository?: ListingsRepository;
}

export function ListingsPage({ repository = httpListingsRepository }: ListingsPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ListingsTab>("search");
  const [query, setQuery] = useState("");
  // The query actually sent to the repository - only changes on explicit
  // submit, never while the user is still typing. Against the mock this
  // was a free local filter; against real Etsy every debounce tick would
  // be a live network call against a 5 req/sec personal-access limit.
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [filter, setFilter] = useState<ListingFilter>("top");
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    // No error-state UI exists anywhere in design/ yet (every other page's
    // repository is a mock that can't fail) - logging is a stopgap so a
    // real failure (e.g. missing Etsy API key) shows up somewhere instead
    // of an unhandled promise rejection, not a designed error experience.
    repository.search(activeQuery, filter).then(setListings).catch(console.error);
  }, [repository, activeQuery, filter]);

  const handleSearchSubmit = useCallback(() => {
    setActiveQuery(query.trim() || DEFAULT_QUERY);
  }, [query]);

  const handleToggleTracked = useCallback(
    async (listingId: string) => {
      await repository.toggleTracked(listingId);
      setListings(await repository.search(activeQuery, filter));
    },
    [repository, activeQuery, filter]
  );

  const handleSelectListing = useCallback((listing: Listing) => navigate(`/listings/${listing.id}`), [navigate]);
  const handleSelectShop = useCallback((shopId: string) => navigate(`/shops/${shopId}`), [navigate]);

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
          onSearchSubmit={handleSearchSubmit}
          searchPlaceholder="Назва товару або ключове слово — напр. funny cat shirt"
          filter={filter}
          onFilterChange={setFilter}
          resultsLabel="Проаналізовано лістингів"
          resultsValue="58 200 000"
          listings={listings}
          onToggleTracked={handleToggleTracked}
          onSelectListing={handleSelectListing}
          onSelectShop={handleSelectShop}
        />
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${trackedListings.length} лістинг(и)`} />
          <div className={styles.tableWrap}>
            <ListingsTable
              listings={trackedListings}
              onToggleTracked={handleToggleTracked}
              onSelectListing={handleSelectListing}
              onSelectShop={handleSelectShop}
            />
          </div>
        </>
      )}
    </div>
  );
}
