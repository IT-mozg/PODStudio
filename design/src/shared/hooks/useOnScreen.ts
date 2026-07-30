import { useEffect, useRef, useState } from "react";

/** How far ahead of the viewport to start loading, so the spinner has usually
 *  resolved by the time the user scrolls there. */
const DEFAULT_ROOT_MARGIN = "200px";

/** Reports whether an element has ever been scrolled into view. Written for
 *  the "similar listings" section (#86), which costs 2-6 Etsy requests against
 *  a 5 req/s key — fetching it for listings nobody scrolls to spends the
 *  budget on nothing.
 *
 *  Latches on purpose: toggling back to false would re-fire the request on
 *  every scroll past. Falls back to true without IntersectionObserver — an
 *  eager fetch beats a section that never loads. */
export function useOnScreen<T extends HTMLElement>(rootMargin = DEFAULT_ROOT_MARGIN) {
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
