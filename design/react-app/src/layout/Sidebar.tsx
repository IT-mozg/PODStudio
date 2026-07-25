import { useLocation, useNavigate } from "react-router-dom";
import { GridSquaresIcon, SearchIcon, SettingsGearIcon } from "../shared/icons";
import { Logo } from "../shared/components/Logo";
import type { NavItem, SidebarMode } from "../shared/types";
import { navByMode, modeForPath } from "./navConfig";
import styles from "./Sidebar.module.css";

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate: (path: string) => void }) {
  return (
    <ul className={styles.navList}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
        return (
          <li
            key={item.id}
            className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            onClick={() => onNavigate(item.path)}
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

interface SidebarProps {
  /** Only meaningful below the drawer breakpoint — ignored by the CSS
   *  on wider screens, where the sidebar is always visible. */
  isOpen: boolean;
  onClose: () => void;
}

/** Sidebar reads navigation state straight from the URL (via the
 *  router) instead of being handed activePage/mode as props — one
 *  less place for "what page am I on" to get out of sync with what's
 *  actually rendered. Same idea as a SwiftUI view reading the
 *  NavigationPath from its environment instead of a passed-in binding.
 *  `isOpen`/`onClose` are the one exception: below ~960px this renders
 *  as an off-canvas drawer, and open/closed is shared UI state with
 *  Topbar's hamburger button, not something derivable from the URL. */
export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const mode: SidebarMode = modeForPath(location.pathname);
  const sectionLabel = mode === "research" ? "Аналітика" : "Керування";

  function switchMode(nextMode: SidebarMode) {
    navigate(navByMode[nextMode][0].path);
  }

  /** The calculator opens as a modal over whatever page is currently
   *  shown, so it needs the current location stashed as router state
   *  (the "background location" pattern) — everything else is a plain
   *  page navigation. */
  function handleNavigate(path: string) {
    if (path === "/calculator") {
      navigate(path, { state: { backgroundLocation: location } });
      return;
    }
    navigate(path);
  }

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} />}
      <aside className={isOpen ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}>
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
            onClick={() => switchMode("research")}
          >
            <SearchIcon size={15} />
            Дослідження
          </button>
          <button
            className={mode === "manage" ? `${styles.modeBtn} ${styles.modeBtnActive}` : styles.modeBtn}
            onClick={() => switchMode("manage")}
          >
            <GridSquaresIcon size={15} />
            Керування
          </button>
        </div>

        <div className={styles.navScroll}>
          <div className={styles.sectionLabel}>{sectionLabel}</div>
          <NavList items={navByMode[mode]} pathname={location.pathname} onNavigate={handleNavigate} />
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
    </>
  );
}
