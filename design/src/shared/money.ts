/* Money parsing and formatting.
 *
 * Never derive a number from a formatted string here: that parse read "—" as
 * 0 and gave every shop the same $20 price distribution (#8). */

export function parseCount(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

/** `null` becomes "—", never "0" — Etsy exposing nothing must not read as a
 *  measured zero. */
export function formatCount(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("uk-UA");
}

export function formatRevenue(n: number | null): string {
  return n === null ? "—" : formatMoney(n);
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/** Etsy's own shape: {amount: 2499, divisor: 100, currency_code: "USD"} →
 *  "$24.99".
 *
 *  Not routed through formatMoney, which hardcodes "$" — a real listing can be
 *  priced in EUR/GBP/PLN, and "€24.99" shown as "$24.99" is wrong, not just
 *  imprecise. */
export function formatPrice(
  amount: number | null,
  divisor: number,
  currency: string,
): string | null {
  if (amount === null || !divisor) return null;
  return formatCurrency(amount / divisor, currency);
}

export function formatCurrency(value: number, currency: string): string {
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat("uk-UA", { style: "currency", currency }).format(value);
  } catch {
    // Intl throws on a currency code it doesn't know.
    return `${value.toFixed(2)} ${currency}`;
  }
}
