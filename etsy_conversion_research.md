# Etsy "Views → Conversion → Est. Sales" reverse-engineering

Research notes from reverse-engineering how third-party Etsy analytics
tools (eRank's "Listing Audit", and a second dark-themed tool referred to
below as "ListingView") derive the numbers they show for a listing:
Views, Daily/Monthly Views, Price, Est. Sales, Conv. Rate, Favorites.

Goal: figure out which of these numbers are real (pulled from Etsy) vs
modeled/estimated, and - for whichever are modeled - reconstruct the
formula, so the same kind of "estimated sales" feature could eventually be
built into POD Studio's own Etsy integration without depending on a paid
third-party tool.

Method: cross-checked each tool's displayed numbers against the official
Etsy Open API v3 (`GET /v3/application/listings/{id}`), using the
credentials already configured in this project (`ui_config.json` →
`etsy_api_key` / `etsy_shared_secret`), via
`models/etsy_api_listing_source.py`'s `_get()` pattern (see that file for
the exact auth header format: `x-api-key: {keystring}:{shared_secret}`).

## What's real (confirmed via official Etsy API, exact matches)

| Field shown by tools | Real Etsy API field | Confirmed |
|---|---|---|
| Views | `views` (lifetime total on the listing object) | exact match, ~20 listings |
| Favorites | `num_favorers` | exact match |
| Price | `price.amount / price.divisor` | exact match |
| Shop total sales ("6k sales" etc.) | `shop.transaction_sold_count` | exact match |

Etsy does **not** expose, publicly or via API, a per-listing sales/orders
count - only the lifetime `views` and the shop-wide `transaction_sold_count`.
Any "sales" number for an individual listing is therefore necessarily a
model/estimate, not a real count, no matter which tool shows it.

## Daily / Monthly Views - simple derived average, not tracked

Confirmed formula (eRank's own help docs literally define it this way,
independently confirmed by our own math against `original_creation_timestamp`):

```
age_days   = now - original_creation_timestamp
Daily Views   = views / age_days
Monthly Views = views / (age_days / 30)
```

Matched to within 1-2 units across 5 different listings. This is a
lifetime average, not a real tracked "views in the last 24h/30d" - a dead
listing and a currently-viral one with the same lifetime views/age would
show identical Daily/Monthly Views.

## Est. Sales = Views × Conv. Rate (confirmed, ~19/19 listings exact)

```
Est. Sales = round(Views * Conv.Rate)
```

Confirmed near-exactly (rounding only) across every listing checked. The
only real unknown is `Conv. Rate` itself.

## Conv. Rate - price-based lookup, NOT category/niche/age dependent

Proven by observing **identical Conv. Rate at identical price across
wildly different niches** (custom t-shirts, Egyptian body oil, copper
water bottles, mouse pads, psychic reading services, Disney magnets - all
at $19.00 → exactly 2.27%). Niche, shop age, favorites count, and listing
age have **zero effect** - only price matters.

Confirmed as a genuine step function (not a smooth curve) by two exact
boundary tests:
- `$19.99 → 2.27%` vs `$20.00 → 2.07%`
- `$34.99 → 1.61%` vs `$35.00 → 1.38%`

A 1-cent price difference flips the rate - this can only be an
`if price < X: ... elif price < Y: ...` bracket table, not a continuous
formula. (The smooth formulas below are our own curve-fit *approximation*
of that underlying table for interpolating unmeasured gaps - not eRank's
actual internal logic.)

### Real observed data points (price → Conv. Rate)

| Price | Conv. Rate | Price | Conv. Rate |
|---|---|---|---|
| $1 – $4.99 (band) | 5.16% | $34.99 | 1.61% |
| $5.00 | 3.31% | $35.00 | 1.38% |
| $10.00–14.99 (band) | 2.51% | $40.00 | 1.31% |
| $15.99 | 2.27% | $44.99 | 1.31% |
| $18.99–19.99 | 2.27% | $45.00 | 1.15% |
| $20.00 | 2.07% | $49.98 | 1.15% |
| $22.00–22.50 | 2.07% | $50.00–54.99 (band) | 1.07% |
| $25.71–28.00 | 1.88% | $55.00–59.99 (band) | 0.98% |
| $30.00 | 1.61% | $70.00 | 0.76% |
| — | — | $80.00 | 0.71% |
| — | — | $90.00 | 0.68% |
| — | — | **$100+** | **0.50% (hard floor, confirmed by user)** |

### Consolidated lookup table for the exact price points we worked through

Every price point actually stepped through in the chat ($1-10 at a $1
step, $10-100 at a $5 step), in one place, with source marked. `REAL` =
directly confirmed against a real listing (or same band as one); `model`
= filled in from the curve-fit formulas below because no real listing at
that exact price was ever checked.

| Price | Conv. Rate | Source |
|---|---|---|
| $1 | 5.16% | REAL |
| $2 | 4.21% | model |
| $3 | 3.73% | model |
| $4 | 3.42% | model |
| $5 | 3.31% | REAL |
| $6 | 3.03% | model |
| $7 | 2.90% | model |
| $8 | 2.78% | model |
| $9 | 2.69% | model |
| $10 | 2.51% | REAL |
| $15 | 2.27% | REAL (same band as confirmed $15.99) |
| $20 | 2.07% | REAL |
| $25 | 1.98% | model (interpolated between real $22.50/$28.00) |
| $30 | 1.61% | REAL |
| $35 | 1.38% | REAL |
| $40 | 1.31% | REAL |
| $45 | 1.15% | REAL |
| $50 | 1.07% | REAL |
| $55 | 0.98% | REAL |
| $60 | 0.92% | model |
| $65 | 0.86% | model |
| $70 | 0.76% | REAL |
| $75 | 0.76%† | model |
| $80 | 0.71% | REAL |
| $85 | 0.68%† | model |
| $90 | 0.68% | REAL |
| $95 | 0.62% | model |
| $100 | 0.50% | REAL (floor) |

† The $60-100 fit is only anchored on 4 points (55/70/80/90), so its
in-between predictions ($75, $85) are the least reliable numbers in this
whole table - notice $75 and $85 land suspiciously close to their
neighbors. Treat those two specifically as rough placeholders, not real
estimates, until an actual listing in that window gets checked.

### Fitted approximation formulas (for filling in unmeasured gaps only)

**Granularity used when tabulating this range matters and must be kept
consistent if this gets revisited:** $1-$10 was worked out at a **step of
$1** (fine enough to catch the curve's steep early drop - e.g. $1→5.16%,
$5→3.31%, $10→2.51%); **$10 and above** was worked out at a **step of $5**
(and $10 wide beyond $50-60, per the observed real bands). Don't
re-tabulate $1-10 at a $5 step later by mistake - the curve is far too
steep there for that to be meaningful.

Three-segment power law, fit via `scipy.optimize.curve_fit` on the real
points above:

```python
def conv_rate_pct(price: float) -> float:
    if price <= 10:
        # fit through the 3 confirmed anchors ($1→5.16%, $5→3.31%, $10→2.51%)
        return 5.1801 * price ** -0.2989
    elif price < 60:
        # fit through the $10-60 band values (11 points), mean err ~0.11pp
        return 8.9585 * price ** -0.5   # ≈ 8.96/√price
    elif price < 100:
        # fit through $55-60/$70/$80/$90 only, mean err ~0.03-0.05pp (tight)
        return 32.2925 * price ** -0.8686
    else:
        return 0.50  # confirmed flat floor from $100 up, per user-provided data
```

Caveats:
- The `$1-10` and `$10-60` segments are independent local fits; they don't
  join up smoothly at the boundary (expected - these are two genuinely
  different curve-fit windows, not one continuous function).
- Gaps never verified against a real listing: **$5-10** (excluding the
  exact $5 point), **$60-70**, **$75-80**, **$85-90**, **$90-95**. Treat
  values in those gaps as rough estimates only, replace with real
  data if/when available.
- The $100+ floor is the one thing confirmed as a hard rule, not a curve.

## The second ("ListingView", dark-themed) tool

Shows Sales/Revenue with a daily-granularity chart and "Nx Outlier" /
"Trending" badges. Confirmed:

```
Revenue = Sales × Price   (exact match, 3/3 listings checked)
```

But its "Sales" number **disagrees** with eRank's "Est. Sales" for the
same listing (e.g. one listing: 519 vs 701; another: 176 vs 81) - direct
proof neither tool has real ground truth, they're two independent guesses.
The smooth, evenly-rounded daily chart (no jagged single-day spikes, which
real order data always has) suggests the day-by-day curve is a cosmetically
interpolated spline between a couple of real anchor points, not genuine
per-day tracking.

## Where the price→Conv.Rate table itself probably comes from (unconfirmed hypothesis)

eRank's own help docs (`hc.erank.com/en/articles/6963927-listing-audit`)
define the metrics but disclose zero methodology for Est. Sales/Conv. Rate.
No public source (their blog, help center, seller forums, generic
e-commerce benchmark reports) publishes this exact table - we could not
find prior art matching it.

Best-supported hypothesis: since Etsy's API *does* expose real, aggregate,
shop-level `transaction_sold_count` alongside real per-listing `views` for
every shop, a company doing Etsy-wide crawling at scale could compute a
genuine `Σ(shop sales) / Σ(shop views)` ratio across a large sample of
shops grouped by their listings' price range, and bake the resulting
average into a static per-price-bracket table. That would explain why the
number is price-only (no per-listing signal goes into it) yet isn't
arbitrary (it tracks a plausible real "cheaper items convert better"
curve). This is inference, not confirmed.

## Relevance for POD Studio

If we ever want an "estimated sales / conversion" indicator for reference
listings inside this app (e.g. in the Listings tab, alongside the
existing "Популярне"/"Гаряче" calibration in
`models/etsy_api_listing_source.py`), the building blocks are:

1. `views` and `price` - already pulled from the Etsy API today via
   `EtsyApiListingSource._batch_fetch()` (just isn't stored in the
   `Listing` dataclass yet - would need a new field).
2. A `conv_rate_pct(price)` lookup/formula like the one above.
3. `est_sales = round(views * conv_rate_pct(price) / 100)`.

None of this has been wired into the codebase yet - this file is research
only, saved so the formulas don't have to be re-derived from scratch next
time this comes up.
