import { useState } from "react";
import { ChevronDownIcon } from "../../shared/icons";
import styles from "./PhotoSlider.module.css";

interface PhotoSliderProps {
  photos: [string, string][];
  title: string;
}

/** Thumbnail rail + a large active photo with prev/next arrows — the
 *  mock "photos" are gradient tiles with a halftone dot overlay (the
 *  same print-registration motif as the logo) instead of stock images,
 *  since there's no real product photography to show yet. */
export function PhotoSlider({ photos, title }: PhotoSliderProps) {
  const [active, setActive] = useState(0);

  function go(delta: number) {
    setActive((i) => (i + delta + photos.length) % photos.length);
  }

  return (
    <div className={styles.slider}>
      <div className={styles.thumbRail}>
        {photos.map(([c1, c2], i) => (
          <div
            key={i}
            className={i === active ? `${styles.thumb} ${styles.thumbActive}` : styles.thumb}
            style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
            onClick={() => setActive(i)}
            title={`${title} — фото ${i + 1}`}
          >
            <div className={styles.halftone} />
          </div>
        ))}
      </div>

      <div
        className={styles.main}
        style={{ background: `linear-gradient(135deg, ${photos[active][0]}, ${photos[active][1]})` }}
      >
        <div className={styles.halftone} />
        <div className={styles.arrow} style={{ left: 12 }} onClick={() => go(-1)}>
          <span className={styles.rotLeft}>
            <ChevronDownIcon size={16} />
          </span>
        </div>
        <div className={styles.arrow} style={{ right: 12 }} onClick={() => go(1)}>
          <span className={styles.rotRight}>
            <ChevronDownIcon size={16} />
          </span>
        </div>
        <div className={styles.counter}>
          {active + 1} / {photos.length}
        </div>
      </div>
    </div>
  );
}
