import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { SegTabs } from "../../shared/components/SegTabs";
import { SearchBar } from "../../shared/components/SearchBar";
import { FilterChips, type FilterOption } from "../../shared/components/FilterChips";
import { ResultsToolbar } from "../../shared/components/ResultsToolbar";
import { GridSquaresIcon, StarIcon, TrendUpIcon, DesignsIcon } from "../../shared/icons";
import { mockShopsRepository, type ShopsRepository } from "./shopsRepository";
import type { Shop, ShopFilter } from "./types";
import { ShopsTable } from "./ShopsTable";
import styles from "../../shared/components/SearchToolbar.module.css";

const FILTERS: FilterOption<ShopFilter>[] = [
  { id: "top", label: "Топ продавці", icon: StarIcon },
  { id: "growing", label: "Швидко ростуть", icon: TrendUpIcon },
  { id: "podTrend", label: "POD-тренд", icon: DesignsIcon },
  { id: "similar", label: "Схожі на мої", icon: GridSquaresIcon },
];

type ShopsTab = "search" | "tracked";

interface ShopsPageProps {
  /** Defaults to the in-memory mock — pass a real API-backed
   *  repository here later without touching anything below. */
  repository?: ShopsRepository;
}

export function ShopsPage({ repository = mockShopsRepository }: ShopsPageProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ShopsTab>("search");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShopFilter>("top");
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    repository.search(query, filter).then(setShops);
  }, [repository, query, filter]);

  async function handleToggleTracked(shopId: string) {
    await repository.toggleTracked(shopId);
    setShops(await repository.search(query, filter));
  }

  const trackedShops = useMemo(() => shops.filter((s) => s.tracked), [shops]);

  return (
    <div>
      <PageHeader title="Магазини" subtitle="Аналізуйте будь-який Etsy-магазин конкурента або відстежуйте власні" />

      <SegTabs
        tabs={[
          { id: "search", label: "Пошук" },
          { id: "tracked", label: "Відстежувані", badge: trackedShops.length },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "search" && (
        <>
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={() => repository.search(query, filter).then(setShops)}
            placeholder="Назва магазину або URL — напр. CatTeesShop"
          />
          <FilterChips options={FILTERS} active={filter} onSelect={setFilter} />

          <ResultsToolbar label="Проаналізовано магазинів" value="4 790 675" />
          <div className={styles.tableWrap}>
            <ShopsTable shops={shops} onToggleTracked={handleToggleTracked} onSelectShop={(s) => navigate(`/shops/${s.id}`)} />
          </div>
        </>
      )}

      {tab === "tracked" && (
        <>
          <ResultsToolbar label="У відстежуваних" value={`${trackedShops.length} магазин(и)`} />
          <div className={styles.tableWrap}>
            <ShopsTable shops={trackedShops} onToggleTracked={handleToggleTracked} onSelectShop={(s) => navigate(`/shops/${s.id}`)} />
          </div>
        </>
      )}
    </div>
  );
}
