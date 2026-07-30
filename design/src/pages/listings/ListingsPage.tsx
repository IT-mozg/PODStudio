import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { describeError } from "../../shared/api";
import { httpListingsRepository } from "./httpListingsRepository";
import { sortListings } from "./listingFilters";
import type { ListingsRepository } from "./listingsRepository";
import type { Listing, ListingFilter } from "./types";
import { ListingsSearchPanel } from "./ListingsSearchPanel";
import { ListingsTable } from "./ListingsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

type ListingsTab = "search" | "tracked";

/** Etsy's search API rejects an empty query, so first load needs a real
 *  keyword. */
const DEFAULT_QUERY = "t-shirt";

interface ListingsPageProps {
  /** Pass mockListingsRepository for the fixed 5-row demo data. */
  repository?: ListingsRepository;
}

export function ListingsPage({ repository = httpListingsRepository }: ListingsPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ListingsTab>("search");
  const [query, setQuery] = useState("");
  // Only changes on explicit submit: against real Etsy every debounce tick
  // would be a live call against a 5 req/s key.
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [filter, setFilter] = useState<ListingFilter>("top");
  const [listings, setListings] = useState<Listing[]>([]);
  // Their own call, not a filter over `listings`: a bookmark outlives the
  // query it was made under.
  const [tracked, setTracked] = useState<Listing[]>([]);
  // Rendered as a banner — see ShopsPage for why logging isn't enough.
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button so the search effect re-runs on the same query.
  const [reloadToken, setReloadToken] = useState(0);

  const refreshTracked = useCallback(
    () =>
      repository
        .getTracked()
        .then(setTracked)
        .catch((e) => {
          console.error(e);
          setError(describeError(e));
        }),
    [repository],
  );

  useEffect(() => {
    // Stale-response guard: switching queries mid-flight would otherwise let
    // whichever request resolves last win.
    let cancelled = false;
    setError(null);
    repository
      .search(activeQuery)
      .then((found) => {
        if (!cancelled) setListings(found);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setListings([]);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repository, activeQuery, reloadToken]);

  useEffect(() => {
    refreshTracked();
  }, [refreshTracked]);

  // Chips sort client-side, so changing one must not re-fetch.
  const visibleListings = useMemo(() => sortListings(listings, filter), [listings, filter]);
  const visibleTracked = useMemo(() => sortListings(tracked, filter), [tracked, filter]);

  const handleSearchSubmit = useCallback(() => {
    setActiveQuery(query.trim() || DEFAULT_QUERY);
  }, [query]);

  const openListing = useCallback(
    (listing: Listing) => navigate(`/listings/${listing.id}`),
    [navigate],
  );

  const openShop = useCallback((shopId: string) => navigate(`/shops/${shopId}`), [navigate]);

  const handleToggleTracked = useCallback(
    async (listingId: string) => {
      try {
        await repository.toggleTracked(listingId);
      } catch (e) {
        // A failed write must not show a bookmark the backend never saved.
        console.error(e);
        setError(describeError(e));
        return;
      }
      // In place, not a re-search: that is a live round trip and would
      // reshuffle rows under the cursor mid-click.
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, tracked: !l.tracked } : l)),
      );
      await refreshTracked();
    },
    [repository, refreshTracked],
  );

  // Safe: these rows carry real Etsy ids and both detail pages read the same
  // live backend.
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

      {error && <ErrorNotice message={error} onRetry={() => setReloadToken((n) => n + 1)} />}

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
          onSelectListing={openListing}
          onSelectShop={openShop}
        />
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${tracked.length} лістинг(и)`} />
          <div className={styles.tableWrap}>
            <ListingsTable
              listings={visibleTracked}
              onToggleTracked={handleToggleTracked}
              onSelectListing={openListing}
              onSelectShop={openShop}
            />
          </div>
        </>
      )}
    </div>
  );
}
