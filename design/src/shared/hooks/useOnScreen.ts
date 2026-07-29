import { useEffect, useRef, useState } from "react";

/** Reports whether an element has ever been scrolled into view.
 *
 *  Written for the detail page's "similar listings" section (#86), whose data
 *  costs two Etsy requests against a 5 req/s, 5000/day key — fetching it for
 *  every listing anyone opens, including the ones nobody scrolls down to,
 *  spends that budget on nothing.
 *
 *  Latches on purpose: once seen, it stays true even after the element
 *  scrolls back out. Toggling would re-trigger the effect that reads it and
 *  fire the same request again on every scroll past.
 *
 *  Falls back to true where IntersectionObserver is unavailable — an eager
 *  fetch is a worse default than lazy, but a section that never loads is
 *  worse than both. */
export function useOnScreen<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    // rootMargin starts the fetch slightly before the section reaches the
    // viewport, so the spinner is usually already resolved by the time the
    // user gets there.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, rootMargin]);

  return [ref, seen] as const;
}
