import styles from "./Toggle.module.css";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? `${styles.toggle} ${styles.on}` : styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <div className={styles.knob} />
    </div>
  );
}
