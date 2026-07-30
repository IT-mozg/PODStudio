import { useEffect, useState } from "react";

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const DEFAULT_DELAY_MS = 300;

/** Returns `value` delayed until `delayMs` after the last change, so a search
 *  effect keyed on it doesn't fire once per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = DEFAULT_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
