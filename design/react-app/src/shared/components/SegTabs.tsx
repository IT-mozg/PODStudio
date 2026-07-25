import styles from "./SearchToolbar.module.css";

export interface SegTabDef<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

interface SegTabsProps<T extends string> {
  tabs: SegTabDef<T>[];
  active: T;
  onSelect: (tab: T) => void;
}

/** Generic segmented tab switcher — Магазини and Лістинги both pass
 *  their own tab ids/labels; this component knows nothing about either. */
export function SegTabs<T extends string>({ tabs, active, onSelect }: SegTabsProps<T>) {
  return (
    <div className={styles.segTabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={tab.id === active ? `${styles.segTab} ${styles.segTabActive}` : styles.segTab}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {tab.badge !== undefined && <span className={styles.badge}>{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}
