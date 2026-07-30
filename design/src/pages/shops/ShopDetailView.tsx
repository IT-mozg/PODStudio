import { useState } from "react";
import { StarIcon, TrendUpIcon, GridSquaresIcon, SearchIcon, ShopBagIcon, ListingsIcon } from "../../shared/icons";
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
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { TodoBadge } from "../../shared/components/TodoBadge";
import { ListingsTable } from "../listings/ListingsTable";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import type { Shop } from "./types";
import { ShopReviewsGrid } from "./ShopReviewsGrid";
import {
  ISSUE_SHOP_CATEGORY,
  ISSUE_SHOP_CONVERSION,
  ISSUE_SHOP_LISTINGS,
  ISSUE_SHOP_MONTHLY_SALES,
  ISSUE_SHOP_NICHE,
  ISSUE_SHOP_REVENUE,
  ISSUE_SHOP_REVIEWS,
} from "./shopTodoIssues";
import {
  PREVIEW_PRICE_BREAKDOWN,
  PREVIEW_PRICE_STATS,
  PREVIEW_RATING_BREAKDOWN,
  PREVIEW_SALES_TREND,
  PREVIEW_SHOP_LISTINGS,
} from "./previewData";
import styles from "./ShopDetailView.module.css";

interface ShopDetailViewProps {
  shop: Shop;
  onBack: () => void;
  onToggleTracked: (shopId: string) => void;
}

type DetailTab = "overview" | "listings" | "reviews";

const NO_DATA = "—";

export function ShopDetailView({ shop, onBack, onToggleTracked }: ShopDetailViewProps) {
  const [tab, setTab] = useState<DetailTab>("overview");

  // null means no reviews at all, not a rating of zero — see Shop.rating.
  const rated = shop.rating !== null;

  /* Real tiles first, then the three Etsy can't answer. Each of those carries
     a badge instead of a delta: StatDatum.badge takes the delta's slot
     precisely so a "—" isn't annotated with a trend it doesn't have.

     Growth (#81) gets no tile of its own — it only ever existed as the delta
     string on the revenue tile, and a fourth dash isn't worth the space. */
  const stats: StatDatum[] = [
    {
      id: "sales",
      icon: ShopBagIcon,
      value: shop.sales,
      label: "Продажів усього",
      delta: { text: "за весь час", tone: "neutral" },
    },
    {
      id: "active",
      icon: GridSquaresIcon,
      value: String(shop.listings),
      label: "Активні лістинги",
      delta: { text: "зараз у продажу", tone: "neutral" },
    },
    {
      id: "favorers",
      icon: StarIcon,
      value: shop.favorers,
      label: "В улюблених",
      delta: { text: "підписників магазину", tone: "neutral" },
    },
    {
      id: "rating",
      icon: StarIcon,
      value: rated ? shop.rating!.toFixed(2) : NO_DATA,
      label: "Рейтинг",
      delta: { text: rated ? `${shop.reviews} відгуків` : "ще немає відгуків", tone: "neutral" },
    },
    {
      id: "age",
      icon: TrendUpIcon,
      value: shop.ageMonths === null ? NO_DATA : `${shop.ageMonths} міс.`,
      label: "Вік магазину",
      delta: { text: "від реєстрації на Etsy", tone: "neutral" },
    },
    {
      id: "revenue",
      icon: SearchIcon,
      value: NO_DATA,
      label: "Дохід усього",
      badge: <TodoBadge issue={ISSUE_SHOP_REVENUE} reason="Etsy не віддає дохід магазину — потрібна оцінка через середню ціну його лістингів" />,
    },
    {
      id: "msales",
      icon: TrendUpIcon,
      value: NO_DATA,
      label: "Продажів / міс.",
      badge: <TodoBadge issue={ISSUE_SHOP_MONTHLY_SALES} reason="Etsy дає лише лічильник продажів за весь час, без розбивки за місяцями" />,
    },
    {
      id: "conv",
      icon: SearchIcon,
      value: NO_DATA,
      label: "Конверсія",
      badge: <TodoBadge issue={ISSUE_SHOP_CONVERSION} reason="Etsy не віддає переглядів магазину, тож конверсію нема з чого порахувати" />,
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <BackButton onClick={onBack} />
        <ShopAvatar initials={shop.initials} iconUrl={shop.iconUrl} />
        <div className={styles.headBody}>
          <div className={styles.headTop}>
            <div>
              <div className={styles.name}>{shop.name}</div>
              <div className={styles.metaRow}>
                {rated ? (
                  <>
                    <span className={styles.ratingStars}>★ {shop.rating!.toFixed(2)}</span>
                    <span>({shop.reviews})</span>
                  </>
                ) : (
                  <span>Ще немає відгуків</span>
                )}
                <span>·</span>
                {/* Labelled, unlike the values these replace. A category name
                    or "Handmade" described itself; a bare "—" doesn't, and
                    three anonymous dashes in a row — two of them on the same
                    ticket — say nothing without hovering. Never <Pill>—</Pill>
                    either: a pill around one reads as a label that failed to
                    load (same rule as ShopsTable). */}
                <span className={styles.metaTodo}>
                  Ніша: {NO_DATA}
                  <TodoBadge issue={ISSUE_SHOP_NICHE} reason="Нішу треба виводити з тегів лістингів магазину — окремого поля в Etsy немає" />
                </span>
                <span>·</span>
                <span className={styles.metaTodo}>
                  Категорія: {NO_DATA}
                  <TodoBadge issue={ISSUE_SHOP_CATEGORY} reason="Категорію треба виводити з taxonomy_id лістингів магазину" />
                </span>
                <span>·</span>
                <span>{shop.listings} лістингів</span>
                <span>·</span>
                <span className={styles.metaTodo}>
                  Handmade: {NO_DATA}
                  <TodoBadge issue={ISSUE_SHOP_CATEGORY} reason="Handmade визначається за who_made лістингів магазину" />
                </span>
                {/* Guarded: an empty href would link back to this page. */}
                {shop.etsyUrl && (
                  <>
                    <span>·</span>
                    <a className={styles.etsyLink} href={shop.etsyUrl} target="_blank" rel="noreferrer">
                      Відкрити на Etsy ↗
                    </a>
                  </>
                )}
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
                <SectionHead
                  icon={SearchIcon}
                  title="Розподіл цін"
                  badge={<TodoBadge issue={ISSUE_SHOP_LISTINGS} reason="Ціни рахуються з лістингів магазину, а такого ендпоінта ще немає" />}
                />
                <NoDataNotice
                  preview={
                    <PanelCard>
                      <div className={styles.priceCard}>
                        <div className={styles.priceStatsRow}>
                          <div>
                            Мін. ціна
                            <b>{PREVIEW_PRICE_STATS.min}</b>
                          </div>
                          <div>
                            Сер. ціна
                            <b>{PREVIEW_PRICE_STATS.avg}</b>
                          </div>
                          <div>
                            Макс. ціна
                            <b>{PREVIEW_PRICE_STATS.max}</b>
                          </div>
                        </div>
                        <BarBreakdown data={PREVIEW_PRICE_BREAKDOWN} />
                      </div>
                    </PanelCard>
                  }
                >
                  Щоб порахувати ціни, треба список лістингів магазину — цей
                  ендпоінт ще не підключено (#{ISSUE_SHOP_LISTINGS}). Блок виглядатиме так:
                </NoDataNotice>

                {/* Half real: the average and the review count are Etsy's own
                    numbers, only the histogram behind them is missing. Same
                    shape as the tags table on Listing Detail — the real half
                    stays, the preview replaces only the absent one. */}
                <div className={styles.ratingCard}>
                  <SectionHead
                    icon={StarIcon}
                    title="Рейтинг і відгуки"
                    badge={<TodoBadge issue={ISSUE_SHOP_REVIEWS} reason="Розподіл зірок треба рахувати з окремого ендпоінта відгуків" />}
                  />
                  <PanelCard>
                    <div className={styles.priceCard}>
                      <div className={styles.ratingHead}>
                        <span className={styles.ratingBig}>{rated ? shop.rating!.toFixed(2) : NO_DATA}</span>
                        <span className={styles.ratingCount}>{shop.reviews} відгуків</span>
                      </div>
                      {/* The copy branches with `rated` for the same reason
                          the number does: "середній бал справжній" next to a
                          "—" is not a statement about missing data, it's a
                          contradiction. */}
                      <NoDataNotice preview={<RatingBars data={PREVIEW_RATING_BREAKDOWN} />}>
                        {rated ? (
                          <>
                            Середній бал і кількість відгуків справжні, а
                            розподіл по зірках — ні: його треба рахувати з
                            ендпоінта відгуків (#{ISSUE_SHOP_REVIEWS}).
                            Виглядатиме так:
                          </>
                        ) : (
                          <>
                            У цього магазину ще немає жодного відгуку, тож і
                            розподілу по зірках нема. Коли відгуки зʼявляться,
                            їх треба буде дочитати з окремого ендпоінта
                            (#{ISSUE_SHOP_REVIEWS}) — блок виглядатиме так:
                          </>
                        )}
                      </NoDataNotice>
                    </div>
                  </PanelCard>
                </div>
              </>
            }
          >
            <SectionHead
              icon={TrendUpIcon}
              title="Продажі за 12 місяців"
              badge={<TodoBadge issue={ISSUE_SHOP_MONTHLY_SALES} reason="Etsy дає один лічильник за весь час — помісячна історія потребує щоденних знімків" />}
            />
            <NoDataNotice
              preview={
                <PanelCard>
                  <div className={styles.chartCard}>
                    <BarTrendChart data={PREVIEW_SALES_TREND} formatValue={(v) => v.toLocaleString("uk-UA")} />
                  </div>
                </PanelCard>
              }
            >
              Etsy віддає лише сумарний лічильник продажів за весь час, без
              розбивки за місяцями. Помісячну історію треба або накопичувати
              щоденними знімками, або оцінювати з гістограми відгуків
              (#{ISSUE_SHOP_MONTHLY_SALES}).
              Графік виглядатиме так:
            </NoDataNotice>

            <SectionHead
              icon={GridSquaresIcon}
              title="Топ лістинги"
              linkText="Усі →"
              onLinkClick={() => setTab("listings")}
              badge={<TodoBadge issue={ISSUE_SHOP_LISTINGS} reason="Потрібен ендпоінт лістингів магазину, щоб було з чого брати топ" />}
            />
            {/* Deliberately the same preview as the Лістинги tab. The tab is
                where the full, searchable list will live; this is the top
                slice of it, and "Усі →" is the way across. Both stay empty
                until #91, so the shorter copy here avoids repeating the whole
                explanation twice on one page. */}
            <NoDataNotice
              preview={
                <div className={searchStyles.tableWrap}>
                  <ListingsTable listings={PREVIEW_SHOP_LISTINGS} onToggleTracked={() => {}} />
                </div>
              }
            >
              Найпродаваніші лістинги магазину зʼявляться тут разом з
              ендпоінтом лістингів (#{ISSUE_SHOP_LISTINGS}):
            </NoDataNotice>
          </TwoColumnLayout>
        </>
      )}

      {tab === "listings" && (
        <>
          <SectionHead
            icon={ListingsIcon}
            title="Лістинги магазину"
            badge={<TodoBadge issue={ISSUE_SHOP_LISTINGS} reason="Потрібен ендпоінт GET /api/shops/<id>/listings поверх Etsy /shops/{id}/listings/active" />}
          />
          {/* The table only, without ListingsSearchPanel: a dimmed search box
              and inert filter chips illustrate nothing about the missing
              data. The panel comes back with the real listings in #91. */}
          <NoDataNotice
            preview={
              <div className={searchStyles.tableWrap}>
                <ListingsTable listings={PREVIEW_SHOP_LISTINGS} onToggleTracked={() => {}} />
              </div>
            }
          >
            Лістинги конкретного магазину Etsy віддає окремим ендпоінтом, який
            ще не підключено (#{ISSUE_SHOP_LISTINGS}) — пошук у застосунку працює лише за
            ключовими словами. Таблиця виглядатиме так:
          </NoDataNotice>
        </>
      )}

      {tab === "reviews" && (
        <>
          <SectionHead
            icon={StarIcon}
            title="Відгуки"
            badge={<TodoBadge issue={ISSUE_SHOP_REVIEWS} reason="Потрібен ендпоінт GET /api/shops/<id>/reviews" />}
          />
          <ShopReviewsGrid reviews={[]} />
        </>
      )}
    </div>
  );
}
