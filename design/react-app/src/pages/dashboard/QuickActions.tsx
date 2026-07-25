import { DesignsIcon, SearchIcon } from "../../shared/icons";
import styles from "./QuickActions.module.css";

export function QuickActions() {
  return (
    <div className={styles.actions}>
      <button className={`${styles.btn} ${styles.primary}`}>
        <SearchIcon size={16} />
        Знайти нові тренди
      </button>
      <button className={styles.btn}>
        <DesignsIcon size={16} />
        Згенерувати з референсу
      </button>
    </div>
  );
}
