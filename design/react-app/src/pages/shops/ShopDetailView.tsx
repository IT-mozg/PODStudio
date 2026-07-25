import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StarIcon, TrendUpIcon, GridSquaresIcon, SearchIcon, ShopBagIcon } from "../../shared/icons";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import { SegTabs } from "../../shared/components/SegTabs";
import { StatGrid, type StatDatum } from "../../shared/components/StatGrid";
import { SectionHead } from "../../shared/components/SectionHead";
import { PanelCard } from "../../shared/components/PanelCard";
import { BarTrendChart } from "../../shared/components/BarTrendChart";
import { BarBreakdown } from "../../shared/components/BarBreakdown";
import { RatingBars } from "../../shared/components/RatingBars";
import { BackButton } from "../../shared/components/BackButton";
import { FollowButton } from "../../shared/components/FollowButton";
import { TwoColumnLayout } from "../../shared/components/TwoColumnLayout";
import { Pill } from "../../shared/components/Pill";
import { ListingsTable } from "../listings/ListingsTable";
import { ListingsSearchPanel } from "../listings/ListingsSearchPanel";
import type { Listing, ListingFilter } from "../listings/types";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import type { Shop } from "./types";
import { buildShopDetail } from "./shopDetail";
import styles from "./ShopDetailView.module.css";

interface ShopDetailViewProps {
  shop: Shop;
  onBack: () => void;
  onToggleTracked: (shopId: string) => void;
}

type DetailTab = "overview" | "listings" | "reviews";

export function ShopDetailView({ shop, onBack, onToggleTracked }: ShopDetailViewProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>("overview");
  const detail = useMemo(() => buildShopDetail(shop), [shop]);

  const [listingQuery, setListingQuery] = useState("");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("top");
  const [trackedOverrides, setTrackedOverrides] = useState<Set<string>>(new Set());

  const handleToggleListingTracked = useCallback((listingId: string) => {
    setTrackedOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  }, []);

  const handleSelectListing = useCallback((listing: Listing) => navigate(`/listings/${listing.id}`), [navigate]);

  // No repository backs a shop's own listings yet (they're generated
  // alongside the rest of buildShopDetail), so the star toggle is
  // applied here rather than round-tripped like the Лістинги page.
  const allListings = useMemo(
    () => detail.listings.map((l) => (trackedOverrides.has(l.id) ? { ...l, tracked: !l.tracked } : l)),
    [detail.listings, trackedOverrides]
  );

  const filteredListings = useMemo(() => {
    const needle = listingQuery.trim().toLowerCase();
    return needle ? allListings.filter((l) => l.title.toLowerCase().includes(needle)) : allListings;
  }, [allListings, listingQuery]);

  const topListings = useMemo(() => allListings.slice(0, 3), [allListings]);

  const stats: StatDatum[] = [
    { id: "sales", icon: ShopBagIcon, value: detail.stats.totalSales, label: "Продажів усього", delta: { text: "з дня старту", tone: "neutral" } },
    { id: "revenue", icon: SearchIcon, value: detail.stats.totalRevenue, label: "Дохід усього", delta: { text: shop.growth, tone: "up" } },
    { id: "conv", icon: TrendUpIcon, value: detail.stats.conversionRate, label: "Конверсія", delta: { text: "приблизно", tone: "neutral" } },
    { id: "active", icon: GridSquaresIcon, value: String(shop.listings), label: "Активні лістинги", delta: { text: shop.niche, tone: "neutral" } },
    { id: "msales", icon: TrendUpIcon, value: detail.stats.monthlySales, label: "Продажів / міс.", delta: { text: "в середньому", tone: "neutral" } },
    { id: "mrev", icon: SearchIcon, value: detail.stats.monthlyRevenue, label: "Дохід / міс.", delta: { text: "в середньому", tone: "neutral" } },
    { id: "avgprice", icon: GridSquaresIcon, value: detail.stats.avgPrice, label: "Середня ціна", delta: { text: `${detail.stats.leastExpensive}–${detail.stats.mostExpensive}`, tone: "neutral" } },
    { id: "rating", icon: StarIcon, value: shop.rating.toFixed(2), label: "Рейтинг", delta: { text: `${shop.reviews} відгуків`, tone: "up" } },
  ];

  return (
    <div>
      <div className={styles.header}>
        <BackButton onClick={onBack} />
        <ShopAvatar initials={shop.initials} />
        <div className={styles.headBody}>
          <div className={styles.headTop}>
            <div>
              <div className={styles.name}>{shop.name}</div>
              <div className={styles.metaRow}>
                <span className={styles.ratingStars}>★ {shop.rating.toFixed(2)}</span>
                <span>({shop.reviews})</span>
                <span>·</span>
                <Pill>{shop.niche}</Pill>
                <span>·</span>
                <span>{detail.category}</span>
                <span>·</span>
                <span>{shop.listings} лістингів</span>
                <span>·</span>
                <span>{detail.handmade ? "Handmade" : "Не handmade"}</span>
              </div>
            </div>
            <FollowButton tracked={shop.tracked} onClick={() => onToggleTracked(shop.id)} />
          </div>
        </div>
      </div>

      <SegTabs
        tabs={[
          { id: "overview", label: "Огляд" },
          { id: "listings", label: "Лістинги" },
          { id: "reviews", label: "Відгуки" },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "overview" && (
        <>
          <StatGrid stats={stats} />

          <TwoColumnLayout
            ratio="1.4fr 1fr"
            aside={
              <>
                <SectionHead icon={SearchIcon} title="Розподіл цін" />
                <PanelCard>
                  <div className={styles.priceCard}>
                    <div className={styles.priceStatsRow}>
                      <div>
                        Мін. ціна
                        <b>{detail.stats.leastExpensive}</b>
                      </div>
                      <div>
                        Сер. ціна
                        <b>{detail.stats.avgPrice}</b>
                      </div>
                      <div>
                        Макс. ціна
                        <b>{detail.stats.mostExpensive}</b>
                      </div>
                    </div>
                    <BarBreakdown data={detail.priceBreakdown} />
                  </div>
                </PanelCard>

                <div className={styles.ratingCard}>
                  <PanelCard>
                    <div className={styles.priceCard}>
                      <div className={styles.ratingHead}>
                        <span className={styles.ratingBig}>{shop.rating.toFixed(2)}</span>
                        <span className={styles.ratingCount}>{shop.reviews} відгуків</span>
                      </div>
                      <RatingBars data={detail.ratingBreakdown} />
                    </div>
                  </PanelCard>
                </div>
              </>
            }
          >
            <SectionHead icon={TrendUpIcon} title="Продажі за 12 місяців" />
            <PanelCard>
              <div className={styles.chartCard}>
                <BarTrendChart data={detail.salesTrend} formatValue={(v) => v.toLocaleString("uk-UA")} />
              </div>
            </PanelCard>

            <SectionHead icon={GridSquaresIcon} title="Топ лістинги" linkText="Усі →" />
            <div className={searchStyles.tableWrap}>
              <ListingsTable
                listings={topListings}
                onToggleTracked={handleToggleListingTracked}
                onSelectListing={handleSelectListing}
              />
            </div>
          </TwoColumnLayout>
        </>
      )}

      {tab === "listings" && (
        <ListingsSearchPanel
          query={listingQuery}
          onQueryChange={setListingQuery}
          searchPlaceholder="Назва лістингу в цьому магазині"
          filter={listingFilter}
          onFilterChange={setListingFilter}
          resultsLabel="Лістингів у магазині"
          resultsValue={String(filteredListings.length)}
          listings={filteredListings}
          onToggleTracked={handleToggleListingTracked}
          onSelectListing={handleSelectListing}
        />
      )}

      {tab === "reviews" && (
        <div className={styles.reviewGrid}>
          {detail.reviews.map((r) => (
            <div className={styles.reviewCard} key={r.id}>
              <div className={styles.reviewTop}>
                <span className={styles.reviewStars}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span className={styles.reviewDate}>{r.date}</span>
              </div>
              <div className={styles.reviewText}>{r.text}</div>
              <div className={styles.reviewRef}>Лістинг {r.listingRef}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
