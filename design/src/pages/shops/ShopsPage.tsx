import { useCallback, useEffect, useMemo, useState } from "react";
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
  /** Defaults to the real Etsy-backed repository. Pass mockShopsRepository
   *  to fall back to the fixed 5-row demo data. */
  repository?: ShopsRepository;
}

export function ShopsPage({ repository = httpShopsRepository }: ShopsPageProps) {
  const [tab, setTab] = useState<ShopsTab>("search");
  const [query, setQuery] = useState("");
  // The query actually sent to the repository - only changes on explicit
  // submit, never while the user is still typing. Against the mock a debounce
  // was a free local filter; against real Etsy every debounce tick would be a
  // live network call against a 5 req/sec personal-access limit.
  const [activeQuery, setActiveQuery] = useState("");
  // No chip active by default: the repository returns shops in name-relevance
  // order and that is the right resting state (see sortShops). Clicking the
  // active chip again clears it, so relevance order is always reachable.
  const [filter, setFilter] = useState<ShopFilter | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  // Tracked bookmarks come from their own repository call rather than
  // filtering `shops`: a bookmark outlives the query it was made under, so
  // anything tracked under an earlier search would otherwise be invisible
  // here even though the backend still has it.
  const [tracked, setTracked] = useState<Shop[]>([]);
  // Whatever the last failed repository call said. Rendered as a banner
  // instead of being logged and forgotten: without it, a missing Etsy key, a
  // rate limit or a Flask process running old code all look identical to the
  // user - an empty table reading "Знайдено магазинів: 0".
  const [error, setError] = useState<string | null>(null);
  // Bumped by the retry button to re-run the search effect with the same
  // query (which state alone wouldn't do - nothing else changed).
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
    // Etsy can only find shops by name (there is no "list all shops" mode),
    // so with no query there is nothing to ask for - render the hint below
    // instead of firing a request that can only fail.
    if (!activeQuery) {
      setShops([]);
      setTotal(0);
      setError(null);
      return;
    }
    // Guard against a stale response overwriting a newer one: switching
    // queries mid-flight means whichever request *resolves* last would
    // otherwise win.
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
        // Console for the stack trace, banner for the user - and the rows are
        // cleared, because leaving the previous query's results on screen
        // under a new query reads as "these are your results".
        console.error(e);
        setShops([]);
        setTotal(0);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
    // Deliberately not depending on `filter`: chips only re-sort what is
    // already loaded (sortShops below), so a chip click must not re-issue a
    // live Etsy request.
  }, [repository, activeQuery, reloadToken]);

  useEffect(() => {
    refreshTracked();
  }, [refreshTracked]);

  // Filter chips sort client-side (Etsy has no shop sort at all), so changing
  // one must not trigger a re-fetch.
  const visibleShops = useMemo(() => sortShops(shops, filter), [shops, filter]);
  const visibleTracked = useMemo(() => sortShops(tracked, filter), [tracked, filter]);

  const handleSearchSubmit = useCallback(() => setActiveQuery(query.trim()), [query]);

  const handleToggleTracked = useCallback(
    async (shopId: string) => {
      try {
        await repository.toggleTracked(shopId);
      } catch (e) {
        // Don't flip the star on a failed write - it would show a bookmark
        // the backend never saved, and survive until the next reload.
        console.error(e);
        setError(describeError(e));
        return;
      }
      // Flip the row in place instead of re-running the search: the search is
      // a live Etsy round trip, and re-fetching it here would also reshuffle
      // rows under the user's cursor mid-click.
      setShops((prev) => prev.map((s) => (s.id === shopId ? { ...s, tracked: !s.tracked } : s)));
      await refreshTracked();
    },
    [repository, refreshTracked],
  );

  // onSelectShop is deliberately not passed: rows carry real numeric Etsy
  // shop ids, but ShopDetailPage still resolves against the mock repository
  // (its stats are derived from fields Etsy doesn't expose), so navigating
  // there would always land on "not found". Tracked as issue #8; until then
  // the rows render non-navigable rather than dead-ending.
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
                label="Знайдено магазинів"
                value={
                  total > visibleShops.length
                    ? `${total.toLocaleString("uk-UA")} · показано ${visibleShops.length}`
                    : `${visibleShops.length}`
                }
              />
              <div className={styles.tableWrap}>
                <ShopsTable shops={visibleShops} onToggleTracked={handleToggleTracked} />
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
            <ShopsTable shops={visibleTracked} onToggleTracked={handleToggleTracked} />
          </div>
        </>
      )}
    </div>
  );
}
