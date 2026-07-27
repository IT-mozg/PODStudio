/* Money helpers: parsing/formatting the "$1.2M" / "60 214" shorthand the
 * mock repositories and shopDetail.ts use, plus formatPrice for the raw
 * amount/divisor/currency shape the Etsy API actually returns. */

export function parseCount(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

export function parseMoneyShorthand(s: string): number {
  const m = s.match(/\$?([\d.]+)\s*(k|m)?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === "k") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  return n;
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

/** Average per-unit price implied by aggregate sales/revenue strings —
 *  used wherever a unit price needs deriving for something that only
 *  carries totals (a Listing has no `price` field of its own). */
export function avgUnitPrice(sales: string, revenue: string): number {
  const salesNum = parseCount(sales);
  const revenueNum = parseMoneyShorthand(revenue);
  return salesNum > 0 ? revenueNum / salesNum : 20;
}
