import styles from "./SearchToolbar.module.css";

interface ResultsToolbarProps {
  label: string;
  value: string;
}

/** The "Проаналізовано магазинів: 4 790 675" / "У відстежуваних: 2" line above a results table. */
export function ResultsToolbar({ label, value }: ResultsToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarCount}>
        {label}: <b>{value}</b>
      </div>
    </div>
  );
}
