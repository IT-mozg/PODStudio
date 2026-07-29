import { useMemo } from "react";
import { TrendUpIcon, SearchIcon, ShopBagIcon, CalculatorIcon, ListingsIcon, CheckShieldIcon, LightningIcon } from "../../shared/icons";
import { StatGrid, type StatDatum } from "../../shared/components/StatGrid";
import { SectionHead } from "../../shared/components/SectionHead";
import { PanelCard } from "../../shared/components/PanelCard";
import { BackButton } from "../../shared/components/BackButton";
import { FollowButton } from "../../shared/components/FollowButton";
import { TodoBadge } from "../../shared/components/TodoBadge";
import { NoDataNotice } from "../../shared/components/NoDataNotice";
import { TwoColumnLayout } from "../../shared/components/TwoColumnLayout";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import { PREVIEW_TAGS } from "./previewData";
import type { ListingDetail, ListingTag } from "./types";
import { PhotoSlider } from "./PhotoSlider";
import { TagsAuditTable } from "./TagsAuditTable";
import { SeoChecklist } from "./SeoChecklist";
import { FlaggedDescription } from "./FlaggedDescription";
import { ListingScoreCard } from "./ListingScoreCard";
import { SimilarListingsCarousel } from "./SimilarListingsCarousel";
import styles from "./ListingDetailView.module.css";

const NO_DATA = "—";

interface ListingDetailViewProps {
  listing: ListingDetail;
  onBack: () => void;
  onToggleTracked: (listingId: string) => void;
  onSelectListing: (listingId: string) => void;
  onSelectShop: (shopId: string) => void;
}

export function ListingDetailView({ listing, onBack, onToggleTracked, onSelectListing, onSelectShop }: ListingDetailViewProps) {
  // Tag names are real; every metric beside them needs the search-volume
  // engine (#54/#56) and stays null so the table renders "—".
  const tags: ListingTag[] = useMemo(
    () => listing.tags.map((tag) => ({ tag, volume: null, competition: null, kd: null, sparkline: null })),
    [listing.tags],
  );

  const stats: StatDatum[] = [
    {
      id: "views",
      icon: TrendUpIcon,
      value: listing.viewsPerMonth,
      // With no creation date there is nothing to divide by, so the tile
      // says what the number actually is instead of claiming a rate.
      label: listing.ageMonths === null ? "Переглядів за весь час" : "Переглядів / міс.",
      ...(listing.ageMonths === null
        ? {}
        : { delta: { text: "у середньому за весь час", tone: "neutral" as const } }),
    },
    {
      id: "conv",
      icon: SearchIcon,
      // Carries its own "≈" (see listingMapper), which is the whole marking
      // this tile gets — deliberately no delta caption and no tooltip, on the
      // project owner's call. Etsy publishes no conversion rate at all; this
      // is the price-bucket model in models/conversion_rate.py.
      value: listing.convRate ?? NO_DATA,
      label: "Конверсія",
    },
    // Formatted by listingMapper, in the listing's own currency. "(оц.)"
    // because both come from #57's estimate, not from Etsy.
    {
      id: "sales",
      icon: ShopBagIcon,
      value: listing.sales,
      label: "Продажів (оц.)",
    },
    {
      id: "revenue",
      icon: CalculatorIcon,
      value: listing.revenue,
      label: "Дохід (оц.)",
    },
  ];

  return (
    <div>
      <div className={styles.backRow}>
        <BackButton onClick={onBack} />
      </div>

      {/* Gallery left, product card right - the layout Etsy itself uses, and
          the reason the attributes grid lives up here rather than at the
          bottom of the page: the photo column is capped (Etsy serves
          il_570xN, so stretching it wider only upscales), which left the
          right-hand side empty. */}
      <div className={styles.productHeader}>
        <PhotoSlider photos={listing.photos} title={listing.title} />

        <div className={styles.productCard}>
          <h1 className={styles.title}>{listing.title}</h1>

          <div className={styles.shopLine}>
            {/* shopId is a real Etsy shop_id and ShopDetailPage resolves it
                against the live backend now (#8), so this leads somewhere. */}
            <b className={styles.shopLink} onClick={() => onSelectShop(listing.shopId)}>
              {listing.shopName}
            </b>
          </div>

          <div className={styles.metaLine}>
            {listing.ageMonths === null ? "вік невідомий" : `${listing.ageMonths} міс. на Etsy`}
            <span className={styles.sep}>·</span>
            {listing.views} переглядів за весь час
            <span className={styles.sep}>·</span>
            {/* Real, unlike the estimated sales/revenue - a 0 here means
                genuinely nobody favourited it. */}
            {listing.favorites} в улюблених
          </div>

          <div className={styles.priceRow}>
            <div className={styles.price}>{listing.price ?? NO_DATA}</div>
          </div>

          <div className={styles.actions}>
            <FollowButton tracked={listing.tracked} onClick={() => onToggleTracked(listing.id)} />
            <a className={styles.etsyLink} href={listing.etsyUrl} target="_blank" rel="noreferrer">
              Відкрити на Etsy ↗
            </a>
          </div>

          <dl className={styles.attrList}>
            {listing.attributes.map((attr) => (
              <div className={styles.attrRow} key={attr.label}>
                <dt className={styles.attrLabel}>{attr.label}</dt>
                <dd className={attr.value === null ? styles.attrEmpty : styles.attrValue}>
                  {attr.value ?? NO_DATA}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <StatGrid stats={stats} />

      <SectionHead
        icon={LightningIcon}
        title="Listing Score"
        badge={<TodoBadge issue={84} reason="Оцінка ще не рахується з реальних полів" />}
      />
      <ListingScoreCard score={null} />

      <SectionHead
        icon={SearchIcon}
        title="Теги та ключові слова"
        badge={<TodoBadge issue={56} reason="Обсяг пошуку, конкуренція і KD потребують рушія пошукового попиту" />}
      />
      <div className={searchStyles.tableWrap}>
        <TagsAuditTable tags={tags} />
      </div>
      {/* The table above already shows the listing's real tags — only the
          metric columns are empty, so the preview goes underneath it rather
          than replacing it. */}
      <NoDataNotice preview={<TagsAuditTable tags={PREVIEW_TAGS} />}>
        Теги справжні, а обсяг пошуку, конкуренція і KD поруч — ні: Etsy їх не
        віддає, потрібен окремий рушій пошукового попиту. Заповнені колонки
        виглядатимуть так:
      </NoDataNotice>

      <TwoColumnLayout
        aside={
          <>
            <SectionHead
              icon={CheckShieldIcon}
              title="SEO — що перевірено"
              badge={<TodoBadge issue={85} reason="Перевірки ще не виводяться з реальних полів лістинга" />}
            />
            <PanelCard>
              <SeoChecklist checks={[]} />
            </PanelCard>
          </>
        }
      >
        {/* Attributes used to sit here; they moved into the product card
            beside the gallery, where a product page expects them. */}
        <SectionHead icon={ListingsIcon} title="Опис" />
        <PanelCard>
          <FlaggedDescription text={listing.description} segments={null} />
        </PanelCard>
      </TwoColumnLayout>

      <SectionHead
        icon={ListingsIcon}
        title="Схожі лістинги"
        badge={<TodoBadge issue={86} reason="Etsy API не має ендпоінта «схожі лістинги»" />}
      />
      <SimilarListingsCarousel items={[]} onSelect={onSelectListing} />
    </div>
  );
}
