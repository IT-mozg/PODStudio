import type { ComponentType } from "react";
import styles from "./SearchToolbar.module.css";

export interface FilterOption<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

interface FilterChipsProps<T extends string> {
  options: FilterOption<T>[];
  active: T;
  onSelect: (filter: T) => void;
}

export function FilterChips<T extends string>({ options, active, onSelect }: FilterChipsProps<T>) {
  return (
    <div className={styles.filterChips}>
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            className={opt.id === active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => onSelect(opt.id)}
          >
            <Icon size={13} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
