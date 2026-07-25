import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Tweens the displayed number from its last value to the new one
 *  instead of snapping — used everywhere the calculator shows a
 *  number that recomputes live (profit, revenue, fees, ROAS…).
 *  Starts each new animation from wherever the number currently is,
 *  so fast typing doesn't cause jumps. Respects reduced-motion. */
export function AnimatedNumber({ value, format, duration = 450 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const to = value;
    if (Math.abs(to - from) < 0.001) return;

    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const current = from + (to - from) * easeOutCubic(t);
      displayRef.current = current;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{format(display)}</>;
}
