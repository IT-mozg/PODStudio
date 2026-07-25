/* Small money-string helpers shared by the deterministic mock-data
 * builders (shopDetail.ts, listingDetail.ts) — parsing/formatting the
 * same "$1.2M" / "60 214" shorthand strings the mock repositories use. */

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

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/** Average per-unit price implied by aggregate sales/revenue strings —
 *  used wherever a unit price needs deriving for something that only
 *  carries totals (a Listing has no `price` field of its own). */
export function avgUnitPrice(sales: string, revenue: string): number {
  const salesNum = parseCount(sales);
  const revenueNum = parseMoneyShorthand(revenue);
  return salesNum > 0 ? revenueNum / salesNum : 20;
}
