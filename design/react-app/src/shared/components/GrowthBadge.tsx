import { GrowthArrowIcon } from "../icons";
import styles from "./GrowthBadge.module.css";

interface GrowthBadgeProps {
  value: string;
}

/** Used by the dashboard trend list and the shops results table. */
export function GrowthBadge({ value }: GrowthBadgeProps) {
  return (
    <div className={styles.badge}>
      <GrowthArrowIcon size={12} />
      {value}
    </div>
  );
}
