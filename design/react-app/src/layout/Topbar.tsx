import { BellIcon, SearchIcon } from "../shared/icons";
import styles from "./Topbar.module.css";

interface TopbarProps {
  currentPageLabel: string;
}

export function Topbar({ currentPageLabel }: TopbarProps) {
  return (
    <div className={styles.topbar}>
      <div className={styles.breadcrumb}>
        <span>POD Studio</span> / <b>{currentPageLabel}</b>
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
