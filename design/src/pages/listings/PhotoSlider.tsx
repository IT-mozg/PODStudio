import { useEffect, useState } from "react";
import { ChevronDownIcon, ImageIcon } from "../../shared/icons";
import styles from "./PhotoSlider.module.css";

interface PhotoSliderProps {
  /** Etsy photo URLs (il_570xN), in Etsy's own rank order. */
  photos: string[];
  title: string;
}

/** Thumbnail rail + a large active photo with prev/next arrows. All of the
 *  listing's Etsy photos, not just the search grid's thumbnail. */
export function PhotoSlider({ photos, title }: PhotoSliderProps) {
  const [active, setActive] = useState(0);
  // One aspect ratio for the whole slider, from the primary photo, so the
  // stage never resizes while paging — differently shaped photos are centred
  // inside it. Two earlier attempts were worse: a fixed height with
  // object-fit cover cropped wide designs, and sizing per photo made the
  // frame and its arrows jump.
  //
  // `new Image()` rather than onLoad, so the stage is already the right shape
  // when the first photo paints. No extra network — the rail requests the
  // same URL.
  const [ratio, setRatio] = useState<number | null>(null);

  // Navigating listing→listing remounts nothing, so without this photo #6
  // would index past a listing that has three, keeping the old stage shape.
  useEffect(() => {
    setActive(0);
    setRatio(null);
  }, [photos]);

  useEffect(() => {
    const first = photos[0];
    if (!first) return;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled || !probe.naturalWidth || !probe.naturalHeight) return;
      setRatio(probe.naturalWidth / probe.naturalHeight);
    };
    probe.src = first;
    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (!photos.length) {
    return (
      <div className={styles.empty} title={title}>
        <ImageIcon size={20} />
        <span>Etsy не повертає фото для цього лістинга</span>
      </div>
    );
  }

  function go(delta: number) {
    setActive((i) => (i + delta + photos.length) % photos.length);
  }

  const index = Math.min(active, photos.length - 1);

  return (
    <div className={styles.slider}>
      {/* The rail is absolutely positioned inside this wrapper so it can't
          make the row taller than the stage — it scrolls instead, the way
          Etsy's does. The wrapper itself has no intrinsic height, so the row
          is sized purely by the stage. */}
      <div className={styles.thumbRailWrap}>
        <div className={styles.thumbRail}>
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              className={i === index ? `${styles.thumb} ${styles.thumbActive}` : styles.thumb}
              onClick={() => setActive(i)}
              title={`${title} — фото ${i + 1}`}
            >
              <img className={styles.thumbImg} src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      <div className={styles.main} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
        <img className={styles.mainImg} src={photos[index]} alt={title} />
        {photos.length > 1 && (
          <>
            <button type="button" className={styles.arrow} style={{ left: 12 }} onClick={() => go(-1)} aria-label="Попереднє фото">
              <span className={styles.rotLeft}>
                <ChevronDownIcon size={16} />
              </span>
            </button>
            <button type="button" className={styles.arrow} style={{ right: 12 }} onClick={() => go(1)} aria-label="Наступне фото">
              <span className={styles.rotRight}>
                <ChevronDownIcon size={16} />
              </span>
            </button>
          </>
        )}
        <div className={styles.counter}>
          {index + 1} / {photos.length}
        </div>
      </div>
    </div>
  );
}
