import { useMemo } from "react";
import { TrendUpIcon, SearchIcon, ImageIcon, ListingsIcon, CheckShieldIcon, GridSquaresIcon, LightningIcon } from "../../shared/icons";
import { StatGrid, type StatDatum } from "../../shared/components/StatGrid";
import { SectionHead } from "../../shared/components/SectionHead";
import { PanelCard } from "../../shared/components/PanelCard";
import { BackButton } from "../../shared/components/BackButton";
import { FollowButton } from "../../shared/components/FollowButton";
import { TwoColumnLayout } from "../../shared/components/TwoColumnLayout";
import searchStyles from "../../shared/components/SearchToolbar.module.css";
import type { Listing } from "./types";
import { buildListingDetail } from "./listingDetail";
import { PhotoSlider } from "./PhotoSlider";
import { TagsAuditTable } from "./TagsAuditTable";
import { SeoChecklist } from "./SeoChecklist";
import { FlaggedDescription } from "./FlaggedDescription";
import { ListingScoreCard } from "./ListingScoreCard";
import { SimilarListingsCarousel } from "./SimilarListingsCarousel";
import styles from "./ListingDetailView.module.css";

interface ListingDetailViewProps {
  listing: Listing;
  onBack: () => void;
  onToggleTracked: (listingId: string) => void;
  onSelectListing: (listingId: string) => void;
  onSelectShop: (shopId: string) => void;
}

export function ListingDetailView({ listing, onBack, onToggleTracked, onSelectListing, onSelectShop }: ListingDetailViewProps) {
  const detail = useMemo(() => buildListingDetail(listing), [listing]);

  const stats: StatDatum[] = [
    { id: "views", icon: TrendUpIcon, value: detail.stats.monthlyViews, label: "Переглядів / міс.", delta: { text: "приблизно", tone: "neutral" } },
    { id: "conv", icon: SearchIcon, value: detail.stats.conversionRate, label: "Конверсія", delta: { text: "оцінка", tone: "neutral" } },
    {
      id: "tags",
      icon: ListingsIcon,
      value: detail.stats.tagsFilled,
      label: "Тегів заповнено",
      delta: { text: detail.tags.length === 13 ? "максимум" : "можна додати ще", tone: detail.tags.length === 13 ? "up" : "warn" },
    },
    { id: "photos", icon: ImageIcon, value: String(detail.stats.photoCount), label: "Фото у слайдері", delta: { text: "жодного графіка тут немає", tone: "neutral" } },
  ];

  return (
    <div>
      <div className={styles.backRow}>
        <BackButton onClick={onBack} />
      </div>

      <PhotoSlider photos={detail.photos} title={listing.title} />

      <div className={styles.headRow}>
        <div>
          <h1 className={styles.title}>{listing.title}</h1>
          <div className={styles.shopLine}>
            <b className={styles.shopLink} onClick={() => onSelectShop(listing.shopId)}>{listing.shopName}</b>
            <span className={styles.sep}>·</span>
            {listing.ageMonths} міс. на Etsy
            <span className={styles.sep}>·</span>
            {listing.views} переглядів
          </div>
        </div>
        <div className={styles.priceBlock}>
          <div className={styles.price}>{detail.stats.avgPrice}</div>
          <div className={styles.priceSub}>{listing.sales} продажів · {listing.revenue}</div>
          <div className={styles.followRow}>
            <FollowButton tracked={listing.tracked} onClick={() => onToggleTracked(listing.id)} />
          </div>
        </div>
      </div>

      <StatGrid stats={stats} />

      <SectionHead icon={LightningIcon} title="Listing Score" />
      <ListingScoreCard score={detail.score} />

      <SectionHead icon={SearchIcon} title="Теги та ключові слова" />
      <div className={searchStyles.tableWrap}>
        <TagsAuditTable tags={detail.tags} />
      </div>

      <TwoColumnLayout
        aside={
          <>
            <SectionHead icon={CheckShieldIcon} title="SEO — що перевірено" />
            <PanelCard>
              <SeoChecklist checks={detail.seoChecks} />
            </PanelCard>
          </>
        }
      >
        <SectionHead icon={ListingsIcon} title="Опис — з позначеними проблемами" />
        <PanelCard>
          <FlaggedDescription segments={detail.descriptionSegments} />
        </PanelCard>

        <SectionHead icon={GridSquaresIcon} title="Атрибути та категорія" />
        <div className={styles.attrGrid}>
          {detail.attributes.map((attr) => (
            <div className={styles.attr} key={attr.label}>
              <div className={styles.attrLabel}>{attr.label}</div>
              <div className={styles.attrValue}>{attr.value}</div>
            </div>
          ))}
        </div>
      </TwoColumnLayout>

      <SectionHead icon={ListingsIcon} title="Схожі лістинги" />
      <SimilarListingsCarousel items={detail.similar} onSelect={onSelectListing} />
    </div>
  );
}
