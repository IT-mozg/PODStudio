import { useId, useState } from "react";
import styles from "./InfoHint.module.css";

/** A small "i" that explains the thing next to it — on hover, on keyboard
 *  focus, or on click. The click branch is what makes it usable on a touch
 *  screen, where there is no hover at all; a native `title` attribute would
 *  simply never appear there. */
export function InfoHint({ text, label = "Пояснення" }: { text: string; label?: string }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const open = hovered || pinned;

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={`${styles.button} ${open ? styles.open : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((was) => !was)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
      >
        i
      </button>
      {open ? (
        <span className={styles.bubble} id={id} role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}
