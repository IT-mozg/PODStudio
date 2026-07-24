import { GridSquaresIcon, SearchIcon, SettingsGearIcon } from "../shared/icons";
import { Logo } from "../shared/components/Logo";
import type { NavItem, PageId, SidebarMode } from "../shared/types";
import { navByMode } from "./navConfig";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  mode: SidebarMode;
  activePage: PageId;
  onModeChange: (mode: SidebarMode) => void;
  onSelectPage: (page: PageId) => void;
}

function NavList({ items, activePage, onSelectPage }: { items: NavItem[]; activePage: PageId; onSelectPage: (p: PageId) => void }) {
  return (
    <ul className={styles.navList}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activePage;
        return (
          <li
            key={item.id}
            className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            onClick={() => onSelectPage(item.id)}
          >
            <Icon size={17} />
            {item.label}
            {item.badge && <span className={styles.navBadge}>{item.badge}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Sidebar owns only presentation + selection callbacks — it has no
 *  idea what a "page" renders (Single Responsibility / Dependency
 *  Inversion: it depends on the NavItem[] abstraction, not on any
 *  specific page component). */
export function Sidebar({ mode, activePage, onModeChange, onSelectPage }: SidebarProps) {
  const sectionLabel = mode === "research" ? "Аналітика" : "Керування";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoRow}>
        <div className={styles.logoMark}>
          <Logo size={20} />
        </div>
        <div>
          <div className={styles.logoText}>
            <span>POD Studio</span>
          </div>
          <div className={styles.logoSub}>automation · design · publish</div>
        </div>
      </div>

      <div className={styles.modeSwitch}>
        <button
          className={mode === "research" ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
          onClick={() => onModeChange("research")}
        >
          <SearchIcon size={15} />
          Дослідження
        </button>
        <button
          className={mode === "manage" ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
          onClick={() => onModeChange("manage")}
        >
          <GridSquaresIcon size={15} />
          Керування
        </button>
      </div>

      <div className={styles.navScroll}>
        <div className={styles.sectionLabel}>{sectionLabel}</div>
        <NavList items={navByMode[mode]} activePage={activePage} onSelectPage={onSelectPage} />
      </div>

      <div className={styles.footer}>
        <div className={styles.upgradeCard}>
          <b>Pro-план</b>
          Безлімітна генерація дизайнів і магазинів
        </div>
        <div className={styles.footerRow}>
          <div className={styles.avatar}>S</div>
          <div className={styles.footerUser}>
            <div className={styles.footerName}>Synevir</div>
            <div className={styles.footerPlan}>hustonmen@gmail.com</div>
          </div>
          <div className={styles.iconBtn} title="Налаштування">
            <SettingsGearIcon size={15} />
          </div>
        </div>
      </div>
    </aside>
  );
}
