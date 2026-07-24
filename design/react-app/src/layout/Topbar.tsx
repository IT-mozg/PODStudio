import { useLocation } from "react-router-dom";
import { BellIcon, SearchIcon } from "../shared/icons";
import { findNavItemForPath } from "./navConfig";
import styles from "./Topbar.module.css";

/** Breadcrumb label comes straight from the URL match — a detail
 *  route like /shops/ct123 still reports "Магазини" here (the page
 *  itself shows the specific name in its own header). */
export function Topbar() {
  const location = useLocation();
  const label = findNavItemForPath(location.pathname)?.label ?? "";

  return (
    <div className={styles.topbar}>
      <div className={styles.breadcrumb}>
        <span>POD Studio</span> / <b>{label}</b>
      </div>
      <div className={styles.actions}>
        <div className={styles.searchPill}>
          <SearchIcon size={14} />
          Швидкий пошук…
        </div>
        <div className={styles.iconBtn} title="Сповіщення">
          <BellIcon size={15} />
        </div>
      </div>
    </div>
  );
}
