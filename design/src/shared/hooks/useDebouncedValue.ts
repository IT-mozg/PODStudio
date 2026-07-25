import { useEffect, useState } from "react";

/** Returns `value`, but delayed by `delayMs` after the last change —
 *  so a search effect keyed on the debounced value doesn't re-fire on
 *  every keystroke. Harmless against the in-memory mock repositories
 *  today, but this is the seam that matters once `search()` becomes a
 *  real network call. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
