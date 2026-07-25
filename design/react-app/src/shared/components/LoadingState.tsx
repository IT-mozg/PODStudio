import styles from "./LoadingState.module.css";

/** Centered pulse shown while a route's data is still resolving —
 *  replaces a bare `return null`, which reads as a blank/broken page
 *  for the moment before data arrives. */
export function LoadingState() {
  return (
    <div className={styles.wrap}>
      <div className={styles.pulse} />
    </div>
  );
}
