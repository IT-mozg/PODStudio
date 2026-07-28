/* Money helpers: parsing/formatting the "$1.2M" / "60 214" shorthand the
 * mock repositories use, plus formatPrice for the raw amount/divisor/currency
 * shape the Etsy API actually returns.
 *
 * parseMoneyShorthand and avgUnitPrice used to live here too. Both existed to
 * turn a formatted string back into a number so shopDetail.ts could derive an
 * average price from it — and on real data that parse read "—" as 0, which is
 * how #8 ended up showing a $20 price distribution for every shop. Deleted
 * with that file: deriving money from a display string is the bug, not the
 * helper. */

export function parseCount(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

/** Renders a count the backend may have no real number for. `null` becomes
 *  "—" rather than "0", so the UI never implies a real zero where Etsy
 *  simply exposes nothing (a listing's sales, a shop's growth, ...). */
export function formatCount(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("uk-UA");
}

/** Same, for money. */
export function formatRevenue(n: number | null): string {
  return n === null ? "—" : formatMoney(n);
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/** A listing's own price, from the shape Etsy actually returns:
 *  {amount: 2499, divisor: 100, currency_code: "USD"} → "$24.99".
 *
 *  Deliberately not routed through formatMoney: that one hardcodes "$"
 *  because it renders derived aggregates, but a real listing's price can be
 *  in EUR/GBP/PLN, and showing "€24.99" as "$24.99" would be wrong rather
 *  than merely imprecise. `null` when the backend has no price at all. */
export function formatPrice(
  amount: number | null,
  divisor: number,
  currency: string,
): string | null {
  if (amount === null || !divisor) return null;
  const value = amount / divisor;
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency }).format(value);
  } catch {
    // Intl throws on a currency code it doesn't know - show the number and
    // the raw code rather than nothing.
    return `${value.toFixed(2)} ${currency}`;
  }
}
