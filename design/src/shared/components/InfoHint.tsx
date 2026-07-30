import { useId, useState } from "react";
import styles from "./InfoHint.module.css";

/** A small "i" explaining the thing next to it — hover, focus, or click.
 *  Click is what makes it work on touch, where a native `title` never
 *  appears.
 *
 *  Tooltip pattern (`role="tooltip"` + `aria-describedby` + Escape), not
 *  disclosure — `aria-expanded` would contradict the tooltip role. */
export function InfoHint({ text, label = "Пояснення" }: { text: string; label?: string }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const open = hovered || pinned;

  // Must clear `hovered` too: a tap focuses first, and touch never delivers
  // mouseleave, so it could never close what it opened.
  const toggle = () => {
    setPinned((was) => !was);
    setHovered(false);
  };

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
        aria-describedby={open ? id : undefined}
        onClick={toggle}
        onFocus={() => setHovered(true)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          event.stopPropagation();
          setHovered(false);
          setPinned(false);
        }}
        onBlur={() => {
          setHovered(false);
          setPinned(false);
        }}
      >
        i
      </button>
      {open ? (
        <span
          className={styles.bubble}
          id={id}
          role="tooltip"
          // Otherwise the press moves focus off the button, `onBlur` closes
          // the hint, and the text vanishes before it can be selected.
          onMouseDown={(event) => event.preventDefault()}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
