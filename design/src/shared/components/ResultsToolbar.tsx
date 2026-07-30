import styles from "./SearchToolbar.module.css";

interface ResultsToolbarProps {
  label: string;
  value: string;
}

export function ResultsToolbar({ label, value }: ResultsToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarCount}>
        {label}: <b>{value}</b>
      </div>
    </div>
  );
}
