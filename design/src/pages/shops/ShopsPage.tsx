import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { SearchBar } from "../../shared/components/SearchBar";
import { FilterChips } from "../../shared/components/FilterChips";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { ErrorNotice } from "../../shared/components/ErrorNotice";
import { describeError } from "../../shared/api";
import { httpShopsRepository } from "./httpShopsRepository";
import { SHOP_FILTERS, sortShops } from "./shopFilters";
import type { ShopsRepository } from "./shopsRepository";
import type { Shop, ShopFilter } from "./types";
import { ShopsTable } from "./ShopsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

type ShopsTab = "search" | "tracked";

interface ShopsPageProps {
  /** Pass mockShopsRepository for the fixed 5-row demo data. */
  repository?: ShopsRepository;
}

export function ShopsPage({ repository = httpShopsRepository }: ShopsPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ShopsTab>("search");
  const [query, setQuery] = useState("");
  // Only changes on explicit submit: against real Etsy every debounce tick
  // would be a live call against a 5 req/s key.
  const [activeQuery, setActiveQuery] = useState("");
  // No chip by default — name-relevance order is the resting state, and
  // clicking the active chip clears it so that order stays reachable.
  const [filter, setFilter] = useState<ShopFilter | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  // Their own call, not a filter over `shops`: a bookmark outlives the query
  // it was made under.
  const [tracked, setTracked] = useState<Shop[]>([]);
  // A banner, not a console log: otherwise a missing Etsy key, a rate limit
  // and a stale Flask process all read as "Знайдено магазинів: 0".
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button, so the effect re-runs on the same query.
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
    // Etsy finds shops by name only, so an empty query has nothing to ask
    // for — render the hint instead of a request that can only fail.
    if (!activeQuery) {
      setShops([]);
      setTotal(0);
      setError(null);
      return;
    }
    // Stale-response guard: otherwise whichever request resolves last wins.
    let cancelled = false;
    setError(null);
    repository
      .search(activeQuery)
      .then((result) => {
        if (cancelled) return;
        setShops(result.shops);
        setTotal(result.total);
      })
      .catch((e) => {
        if (cancelled) return;
        // Rows are cleared too: the previous query's results under a new
        // query read as "these are your results".
        console.error(e);
        setShops([]);
        setTotal(0);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
    // Not depending on `filter`: chips re-sort what is already loaded.
  }, [repository, activeQuery, reloadToken]);

  useEffect(() => {
    refreshTracked();
  }, [refreshTracked]);

  // Chips sort client-side, so changing one must not re-fetch.
  const visibleShops = useMemo(() => sortShops(shops, filter), [shops, filter]);
  const visibleTracked = useMemo(() => sortShops(tracked, filter), [tracked, filter]);

  const handleSearchSubmit = useCallback(() => setActiveQuery(query.trim()), [query]);

  const handleToggleTracked = useCallback(
    async (shopId: string) => {
      try {
        await repository.toggleTracked(shopId);
      } catch (e) {
        // A failed write must not show a bookmark the backend never saved.
        console.error(e);
        setError(describeError(e));
        return;
      }
      // In place, not a re-search: that is a live round trip and would
      // reshuffle rows under the cursor mid-click.
      setShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, tracked: !s.tracked } : s)));
      await refreshTracked();
    },
    [repository, refreshTracked],
  );

  // useCallback because ShopsTable is memoized — an inline arrow would
  // re-render every row on each keystroke.
  const handleSelectShop = useCallback((shop: Shop) => navigate(`/shops/${shop.id}`), [navigate]);

  return (
    <div>
      <PageHeader title="Магазини" subtitle="Аналізуйте будь-який Etsy-магазин конкурента або відстежуйте власні" />

      <SegTabs
        tabs={[
          { id: "search", label: "Пошук" },
          { id: "tracked", label: "Відстежувані", badge: tracked.length },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {error && (
        <ErrorNotice
          message={error}
          onRetry={
            // Only offer a retry when there is a call to retry: the search.
            activeQuery ? () => setReloadToken((n) => n + 1) : undefined
          }
        />
      )}

      {tab === "search" && (
        <>
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={handleSearchSubmit}
            placeholder="Назва магазину — напр. OldRetroTees"
          />
          <FilterChips
            options={SHOP_FILTERS}
            active={filter}
            onSelect={(picked) => setFilter((prev) => (prev === picked ? null : picked))}
          />

          {/* On a failed search neither branch renders: the banner above is
              the whole answer. "Знайдено магазинів: 0" next to an error reads
              as "Etsy has no such shop", which is a different problem. */}
          {activeQuery && !error && (
            <>
              <ResultsToolbar
                label="STALE DIST PROBE"
                value={
                  total > visibleShops.length
                    ? `${total.toLocaleString("uk-UA")} · показано ${visibleShops.length}`
                    : `${visibleShops.length}`
                }
              />
              <div className={styles.tableWrap}>
                <ShopsTable shops={visibleShops} onToggleTracked={handleToggleTracked} onSelectShop={handleSelectShop} />
              </div>
            </>
          )}
          {!activeQuery && !error && (
            <ResultsToolbar
              label="Пошук магазинів"
              value="введи назву магазину — Etsy шукає магазини тільки за назвою"
            />
          )}
        </>
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${tracked.length} магазин(и)`} />
          <div className={styles.tableWrap}>
            <ShopsTable shops={visibleTracked} onToggleTracked={handleToggleTracked} onSelectShop={handleSelectShop} />
          </div>
        </>
      )}
    </div>
  );
}
