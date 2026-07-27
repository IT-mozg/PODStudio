import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { httpListingsRepository } from "./httpListingsRepository";
import { sortListings } from "./listingFilters";
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
  const [tab, setTab] = useState<ListingsTab>("search");
  const [query, setQuery] = useState("");
  // The query actually sent to the repository - only changes on explicit
  // submit, never while the user is still typing. Against the mock this
  // was a free local filter; against real Etsy every debounce tick would
  // be a live network call against a 5 req/sec personal-access limit.
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [filter, setFilter] = useState<ListingFilter>("top");
  const [listings, setListings] = useState<Listing[]>([]);
  // Tracked bookmarks come from their own repository call rather than
  // filtering `listings`: a bookmark outlives the query it was made under,
  // so anything tracked under an earlier search would otherwise be
  // invisible here even though the backend still has it.
  const [tracked, setTracked] = useState<Listing[]>([]);

  const refreshTracked = useCallback(
    () => repository.getTracked().then(setTracked).catch(console.error),
    [repository],
  );

  useEffect(() => {
    // Guard against a stale response overwriting a newer one: switching
    // queries mid-flight means whichever request *resolves* last would
    // otherwise win. Same failure the old UI guards with its loadToken.
    let cancelled = false;
    // No error-state UI exists anywhere in design/ yet (every other page's
    // repository is a mock that can't fail) - logging is a stopgap so a
    // real failure (e.g. missing Etsy API key) shows up somewhere instead
    // of an unhandled promise rejection, not a designed error experience.
    repository
      .search(activeQuery)
      .then((found) => {
        if (!cancelled) setListings(found);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [repository, activeQuery]);

  useEffect(() => {
    refreshTracked();
  }, [refreshTracked]);

  // Filter chips sort client-side (no repository has a server-side sort),
  // so changing one must not trigger a re-fetch.
  const visibleListings = useMemo(() => sortListings(listings, filter), [listings, filter]);
  const visibleTracked = useMemo(() => sortListings(tracked, filter), [tracked, filter]);

  const handleSearchSubmit = useCallback(() => {
    setActiveQuery(query.trim() || DEFAULT_QUERY);
  }, [query]);

  const handleToggleTracked = useCallback(
    async (listingId: string) => {
      await repository.toggleTracked(listingId);
      // Flip the row in place instead of re-running the search: the search
      // is a live Etsy round trip, and re-fetching it here would also
      // reshuffle rows under the user's cursor mid-click.
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, tracked: !l.tracked } : l)),
      );
      await refreshTracked();
    },
    [repository, refreshTracked],
  );

  // onSelectListing/onSelectShop are deliberately not passed: rows carry
  // real numeric Etsy ids, but ListingDetailPage/ShopDetailPage still
  // resolve against the mock repositories, so navigating there would
  // always land on "not found". Tracked as separate tickets; until then
  // the rows render non-navigable rather than dead-ending.
  return (
    <div>
      <PageHeader title="Лістинги" subtitle="Аналізуйте будь-який лістинг конкурента або відстежуйте власні" />

      <SegTabs
        tabs={[
          { id: "search", label: "Пошук" },
          { id: "tracked", label: "Відстежувані", badge: tracked.length },
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
          listings={visibleListings}
          onToggleTracked={handleToggleTracked}
        />
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${tracked.length} лістинг(и)`} />
          <div className={styles.tableWrap}>
            <ListingsTable listings={visibleTracked} onToggleTracked={handleToggleTracked} />
          </div>
        </>
      )}
    </div>
  );
}
