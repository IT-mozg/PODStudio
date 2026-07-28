/* Issue numbers for the Shop Detail blocks that Etsy's API can't back yet.
 *
 * Named constants rather than inline literals in the JSX: TodoBadge builds
 * its href out of the number, so a wrong one ships a link to somebody else's
 * ticket and nothing in the build catches it. One file to check before a
 * merge beats eight scattered numbers.
 *
 * When one of these lands, delete the constant along with its badge and its
 * previewData entry — a preview of a feature that already works is a bug. */

/** #91 — GET /api/shops/<id>/listings over Etsy /shops/{id}/listings/active.
 *  Backs the Лістинги tab and the price distribution. */
export const ISSUE_SHOP_LISTINGS = 91;

/** #80 — estimated shop revenue. Etsy exposes no revenue at all; it has to
 *  be derived from the listings of #91 and their sales estimate (#57/#58). */
export const ISSUE_SHOP_REVENUE = 80;

/** #49 — the 12-month sales chart. Etsy gives one all-time counter, so the
 *  history needs either daily snapshots or the review-histogram estimate. */
export const ISSUE_SHOP_MONTHLY_SALES = 49;

/** #82 — shop niche, derived from the tags of its listings. There is no
 *  niche/category field on a shop record. Depends on #91. */
export const ISSUE_SHOP_NICHE = 82;

/** #92 — GET /api/shops/<id>/reviews. Backs the Відгуки tab and the
 *  5★…1★ histogram. */
export const ISSUE_SHOP_REVIEWS = 92;

/** #93 — shop category (most common taxonomy_id of its listings) and the
 *  handmade flag (majority who_made == i_did). Depends on #91. */
export const ISSUE_SHOP_CATEGORY = 93;

/** #94 — shop conversion rate. A research ticket, not a build one: Etsy
 *  exposes no shop-level views at all, so the rate can't be derived even as
 *  an estimate from what's available today. */
export const ISSUE_SHOP_CONVERSION = 94;
