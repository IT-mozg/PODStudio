import { useId, useState } from "react";
import styles from "./InfoHint.module.css";

/** A small "i" that explains the thing next to it — on hover, on keyboard
 *  focus, or on click. The click branch is what makes it usable on a touch
 *  screen, where there is no hover at all; a native `title` attribute would
 *  simply never appear there.
 *
 *  Stays on the tooltip pattern (`role="tooltip"` + `aria-describedby` +
 *  Escape) rather than the disclosure one — no `aria-expanded`, which would
 *  announce the button as expandable and contradict the tooltip role. */
export function InfoHint({ text, label = "Пояснення" }: { text: string; label?: string }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const open = hovered || pinned;

  // The click has to clear `hovered` as well, or it can never close what it
  // opened: a tap focuses the button first, and a focused button stays
  // "hovered" on a touch screen, where mouseleave is never delivered.
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
        <span className={styles.bubble} id={id} role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}
