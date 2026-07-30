import { useLocation } from "react-router-dom";
import { BellIcon, MenuIcon, SearchIcon } from "../shared/icons";
import { findNavItemForPath } from "./navConfig";
import styles from "./Topbar.module.css";

interface TopbarProps {
  onMenuClick: () => void;
}

/** The breadcrumb comes from the URL match, so /shops/ct123 still reads
 *  "Магазини" — the page shows the specific name in its own header. The
 *  hamburger is CSS-hidden above the drawer breakpoint. */
export function Topbar({ onMenuClick }: TopbarProps) {
  const location = useLocation();
  const label = findNavItemForPath(location.pathname)?.label ?? "";

  return (
    <div className={styles.topbar}>
      <div className={styles.left}>
        <div className={styles.menuBtn} onClick={onMenuClick} title="Меню">
          <MenuIcon size={18} />
        </div>
        <div className={styles.breadcrumb}>
          <span className={styles.brand}>POD Studio /</span> <b>{label}</b>
        </div>
      </div>
      <div className={styles.actions}>
        <div className={styles.searchPill}>
          <SearchIcon size={14} />
          <span>Швидкий пошук…</span>
        </div>
        <div className={styles.iconBtn} title="Сповіщення">
          <BellIcon size={15} />
        </div>
      </div>
    </div>
  );
}
