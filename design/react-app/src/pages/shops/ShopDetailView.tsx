import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, StarIcon, TrendUpIcon, GridSquaresIcon, SearchIcon, ShopBagIcon } from "../../shared/icons";
import { ShopAvatar } from "../../shared/components/ShopAvatar";
import { SegTabs } from "../../shared/components/SegTabs";
import { StatGrid, type StatDatum } from "../../shared/components/StatGrid";
import { SectionHead } from "../../shared/components/SectionHead";
import { PanelCard } from "../../shared/components/PanelCard";
import { BarTrendChart } from "../../shared/components/BarTrendChart";
import { BarBreakdown } from "../../shared/components/BarBreakdown";
import { RatingBars } from "../../shared/components/RatingBars";
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
        <div className={styles.backBtn} onClick={onBack} title="Назад до списку">
          <ArrowLeftIcon size={16} />
        </div>
        <ShopAvatar initials={shop.initials} />
        <div className={styles.headBody}>
          <div className={styles.headTop}>
            <div>
              <div className={styles.name}>{shop.name}</div>
              <div className={styles.metaRow}>
                <span className={styles.ratingStars}>★ {shop.rating.toFixed(2)}</span>
                <span>({shop.reviews})</span>
                <span>·</span>
                <span className={styles.nicheTag}>{shop.niche}</span>
                <span>·</span>
                <span>{detail.category}</span>
                <span>·</span>
                <span>{shop.listings} лістингів</span>
                <span>·</span>
                <span>{detail.handmade ? "Handmade" : "Не handmade"}</span>
              </div>
            </div>
            <div
              className={shop.tracked ? `${styles.trackBtn} ${styles.active}` : styles.trackBtn}
              onClick={() => onToggleTracked(shop.id)}
            >
              <StarIcon size={14} />
              {shop.tracked ? "У відстежуваних" : "Відстежувати"}
            </div>
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

          <div className={styles.twoCol} style={{ marginTop: 8 }}>
            <div>
              <SectionHead icon={TrendUpIcon} title="Продажі за 12 місяців" />
              <PanelCard>
                <div className={styles.chartCard}>
                  <BarTrendChart data={detail.salesTrend} formatValue={(v) => v.toLocaleString("uk-UA")} />
                </div>
              </PanelCard>

              <SectionHead icon={GridSquaresIcon} title="Топ лістинги" linkText="Усі →" />
              <PanelCard>
                {detail.listings.slice(0, 3).map((l) => (
                  <ListingRow key={l.id} listing={l} onClick={() => navigate(`/listings/${l.id}`)} />
                ))}
              </PanelCard>
            </div>

            <div>
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
            </div>
          </div>
        </>
      )}

      {tab === "listings" && (
        <PanelCard>
          {detail.listings.map((l) => (
            <ListingRow key={l.id} listing={l} onClick={() => navigate(`/listings/${l.id}`)} />
          ))}
        </PanelCard>
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

interface ListingRowProps {
  listing: ReturnType<typeof buildShopDetail>["listings"][number];
  onClick: () => void;
}

function ListingRow({ listing, onClick }: ListingRowProps) {
  return (
    <div className={styles.listingRow} onClick={onClick}>
      <div className={styles.listingThumb} style={{ background: `linear-gradient(135deg, ${listing.thumbGradient[0]}, ${listing.thumbGradient[1]})` }} />
      <div className={styles.listingBody}>
        <div className={styles.listingTitle}>{listing.title}</div>
        <div className={styles.listingMeta}>
          {listing.price} · {listing.ageLabel} · ★ {listing.rating.toFixed(1)} ({listing.reviewCount})
        </div>
      </div>
      <div className={styles.listingNums}>
        <div className={styles.listingRevenue}>{listing.revenue}</div>
        <div className={styles.listingSub}>{listing.sales} продажів</div>
      </div>
    </div>
  );
}
