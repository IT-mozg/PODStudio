import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { ShopStatusList } from "../../shared/components/ShopStatusList";
import { StatGrid } from "../../shared/components/StatGrid";
import { CheckShieldIcon, LightningIcon, SearchIcon, ShopBagIcon, TrendUpIcon } from "../../shared/icons";
import { QueueGrid } from "./QueueCard";
import { TrendList } from "./TrendList";
import { KeywordCloud } from "./KeywordCloud";
import { QuickActions } from "./QuickActions";
import { SectionHead } from "../../shared/components/SectionHead";
import { stats, queueItems, trends, keywords, myShops } from "./dashboardData";
import styles from "./DashboardPage.module.css";

/** Дашборд page — composes small, single-purpose widgets over typed
 *  mock data (dashboardData.ts). No widget here knows about any other
 *  page; the only pieces shared with Магазини (ShopStatusList,
 *  GrowthBadge, PanelCard) live in shared/. */
export function DashboardPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Привіт, Synevir 👋" subtitle="Ось що варто знати про ваші магазини й генерацію прямо зараз" />

      <StatGrid stats={stats} />

      <SectionHead icon={CheckShieldIcon} title="Чекає на вашу дію" linkText="Дивитись усі →" />
      <QueueGrid items={queueItems} />

      <div className={styles.grid2}>
        <div>
          <SectionHead icon={TrendUpIcon} title="Тренди зараз" linkText="Усі тренди →" />
          <TrendList items={trends} onSelect={(listingId) => navigate(`/listings/${listingId}`)} />

          <SectionHead icon={SearchIcon} title="Ключові слова, що ростуть" />
          <KeywordCloud keywords={keywords} onSelect={(text) => navigate(`/keywords?q=${encodeURIComponent(text)}`)} />
        </div>

        <div>
          <SectionHead icon={ShopBagIcon} title="Мої магазини" linkText="Усі →" />
          <ShopStatusList shops={myShops} onSelect={(shopId) => navigate(`/shops/${shopId}`)} />

          <SectionHead icon={LightningIcon} title="Швидкі дії" />
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
