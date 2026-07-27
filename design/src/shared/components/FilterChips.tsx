import type { ComponentType } from "react";
import styles from "./SearchToolbar.module.css";

export interface FilterOption<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Renders the chip visibly inert — for filters whose data doesn't exist
   *  yet (see shopFilters.ts). Preferred over hiding the chip: the filter is
   *  part of the intended product, it just has nothing to sort by. */
  disabled?: boolean;
  /** Tooltip explaining why, shown on a disabled chip. */
  disabledHint?: string;
}

interface FilterChipsProps<T extends string> {
  options: FilterOption<T>[];
  /** `null` = no chip active, i.e. the source's own order is shown as-is
   *  (see ShopsPage, where that order is name relevance). */
  active: T | null;
  onSelect: (filter: T) => void;
}

export function FilterChips<T extends string>({ options, active, onSelect }: FilterChipsProps<T>) {
  return (
    <div className={styles.filterChips}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const classes = [styles.chip];
        if (opt.id === active) classes.push(styles.chipActive);
        if (opt.disabled) classes.push(styles.chipDisabled);
        return (
          <button
            key={opt.id}
            className={classes.join(" ")}
            disabled={opt.disabled}
            title={opt.disabled ? opt.disabledHint : undefined}
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
