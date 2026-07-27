import { useEffect, useState } from "react";
import { ChevronDownIcon, ImageIcon } from "../../shared/icons";
import styles from "./PhotoSlider.module.css";

interface PhotoSliderProps {
  /** Real Etsy photo URLs (il_570xN), in Etsy's own rank order. */
  photos: string[];
  title: string;
}

/** Thumbnail rail + a large active photo with prev/next arrows.
 *
 *  These used to be gradient tiles with a halftone overlay, standing in for
 *  product photography nobody had. They are the listing's actual Etsy photos
 *  now — all of them, not just the thumbnail the search grid uses. */
export function PhotoSlider({ photos, title }: PhotoSliderProps) {
  const [active, setActive] = useState(0);
  // One aspect ratio for the whole slider, taken from the listing's primary
  // photo — the same thing Etsy's own gallery does.
  //
  // The stage stays exactly one size while paging; a photo shaped differently
  // is centred inside it (object-fit: contain) rather than resizing it. Two
  // earlier attempts were both worse: a fixed 300px height with object-fit
  // cover cropped wide designs off at the top, and sizing the stage to each
  // photo made the frame — and the arrows pinned to it — jump around and left
  // dead space beside the narrow ones.
  //
  // Measured with `new Image()` rather than an onLoad handler so the stage is
  // already the right shape when the first photo appears, instead of resizing
  // after it paints. Costs no extra network: the thumbnail rail requests the
  // very same URL, so it comes from cache.
  const [ratio, setRatio] = useState<number | null>(null);

  // Navigating straight from one listing to another (a "similar" card, the
  // back button) remounts nothing — without this, photo #6 of the previous
  // listing would index past the end of a listing that only has three, and
  // the previous listing's stage shape would linger.
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
