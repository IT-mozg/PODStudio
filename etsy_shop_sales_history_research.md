# Etsy shop "sales per month" - how the tools do it, and how we will

Research notes on how third-party Etsy analytics tools draw a *sales
history chart* for a competitor's shop - monthly/quarterly sales going back
years - when the official Etsy API exposes only a single lifetime counter
and no time series at all.

Companion to `etsy_conversion_research.md` (which covers the *per-listing*
`Est. Sales = Views x Conv.Rate` model). This file covers the *shop-level,
time-bucketed* number, which turns out to be produced by a completely
different mechanism.

Two tools were reverse-engineered: **ListingView** (`app.listingview.io`)
and **eRank** (`members.erank.com`). They do **not** use the same method.

Method: cross-checked both tools' on-screen numbers against the official
Etsy Open API v3, using this project's own credentials (`ui_config.json` ->
`etsy_api_key` / `etsy_shared_secret`, `x-api-key: {keystring}:{shared_secret}`
- see `models/etsy_api_listing_source.py`). Crucially, one of the four
shops tested is the project owner's own shop, so **real order counts from
Etsy Shop Manager were available as ground truth**.

## What Etsy actually gives you (confirmed)

| Field | Endpoint | Real? |
|---|---|---|
| `transaction_sold_count` | `GET /shops?shop_name=X` | real, lifetime running total, no history |
| `review_count`, `review_average` | same | real |
| `created_timestamp` (shop) | same | real |
| `listing_active_count` | same | real |
| per-review `created_timestamp` | `GET /shops/{id}/reviews` | real, **timestamped** |
| per-review `listing_id`, `transaction_id` | same | real |
| **sales in a given month** | - | **does not exist anywhere** |
| **revenue in any form** | - | **does not exist anywhere** |

`GET /v3/application/shops/{shop_id}/reviews?limit=100&offset=N` needs only
an app-level API key - **no OAuth**, works on any shop. `limit` caps at 100.
There is **no offset cap** (verified at `offset=100000`), so the entire
review history back to shop creation is walkable.

Reviews are the only publicly available, per-transaction, timestamped
signal on Etsy. Everything below follows from that.

## Method A - review histogram (this is what ListingView does)

```
ratio            = transaction_sold_count / review_count      # per shop
Sales(period)    = Reviews(period) * ratio
```

Take the real lifetime total and spread it over time using the shape of the
review histogram. Self-calibrates per shop: the measured `ratio` ranged
from 6.60 to 12.19 across four shops (i.e. an implied 8%-15% review rate),
so no global constant is needed.

### Evidence

- **OldRetroTees, exact hit.** ListingView showed `Monthly Sales 104`.
  Computed independently: 9 reviews in the last 30 days x (254/22 = 11.545)
  = 103.9 -> **104**. Exact to the unit.
- **OldSchoolCulture.** ListingView tooltip "Jun 6" = 4,711; computed 4,607
  (-2.2%).
- **WarungBeads**, quarterly buckets, three points read off the chart:
  peak 2024Q1 computed 112,631 vs ~120K shown; trough 2024Q3 computed
  59,336 vs ~60K; plateau 2025Q3 computed 87,231 vs ~90K.
- **The x-axis always starts at the shop's `created_timestamp`**
  (OldRetroTees "Jan 13" = created 2026-01-13; OldSchoolCulture "Feb 22" =
  created 2023-02-22; WarungBeads "May 2019" = created 2019-05-15).
- **The line sits at exactly zero from shop creation until the first
  review** - even when the shop was demonstrably selling. OldRetroTees was
  created 2026-01-13, first review 2026-03-03, and really did sell in
  Jan-Feb (eRank shows a February bar, and the shop's own dashboard
  confirms); ListingView shows a flat zero for that whole stretch.
- **On low-review shops the curve is visibly spiky**, with dips to zero in
  14-day buckets that happen to contain no reviews (OldRetroTees: zero
  buckets at Apr 07 and May 19 - both weeks the shop was actually selling).

### Limits

- **Quantum = one review.** Nothing smaller than `ratio` sales is
  representable (8-12 sales on the shops measured). Useless for short
  windows on small shops.
- **Blind spot at shop launch.** Sales made before the first review ever
  landed are invisible, and because `ratio` is computed off the lifetime
  total those sales get smeared onto later months, inflating them.
- **Assumes a constant review rate over the shop's whole life**, which is
  not true (Etsy has changed how hard it nudges for reviews). Shape is
  trustworthy; absolute values for old months are not.
- Recent months are also mildly *under*-stated because a sale is reviewed
  days-to-weeks after it happens.

## Method B - snapshot deltas (this is what eRank does)

```
Sales(period) = transaction_sold_count(end) - transaction_sold_count(start)
```

Poll the lifetime counter daily, store it, subtract. Requires no
cleverness - just having started early.

### Evidence eRank uses this and NOT reviews

- **Precision impossible from reviews.** On OldRetroTees one review is
  worth 11.55 sales. eRank reported `7 Day Sales 42` against a real 44
  orders - an error of two. You cannot land within 2 units using a signal
  whose smallest step is 11.55.
- **eRank shows a February 2026 bar for OldRetroTees; there were zero
  reviews in February** (first review 2026-03-03). That bar cannot come
  from reviews.
- **Shape is smooth where reviews are noisy.** eRank monthly for
  OldRetroTees: ~1, 12, 30, 31, 52 (a normal ramp). Review-derived for the
  same months: 0, 35, 23, 35, 81 (noise). Real shops ramp smoothly.
- **History depth is short and arbitrary** - 15 months for OldSchoolCulture
  even though its reviews go back further, and the current month is often
  missing. Consistent with "we only have what we snapshotted".
- eRank's sidebar `Avg.Sales/Day` is just `transaction_sold_count / shop_age_days`
  (72.5 -> 73, 1.3 -> 1, 16.2 -> 16 - exact on all three checked).

### Limits

- **No history before you started collecting.** A shop added today has an
  empty chart today.
- Counts **transactions (line items), not orders** - see the ground-truth
  section below.

## Ground truth check (OldRetroTees, owner's own shop, 2026-07-26)

Real numbers from Etsy Shop Manager -> Stats:

| Window | Orders | Revenue | Views | Visits |
|---|---|---|---|---|
| Last 30 days | **120** | $2,241 | 7,595 | 3,281 |
| Last 7 days | **44** | $767 | 2,586 | 1,040 |

Against each method:

| | 7 days | 30 days | February 2026 |
|---|---|---|---|
| **Real (Shop Manager)** | **44 orders** | **120 orders** | shop was selling |
| eRank (Method B) | 42 | 135 | ~1 |
| ListingView (Method A) | - | 104 | **0** |
| Method A recomputed by us | 58 | 104 | **0** |

eRank's 30-day 135 vs 120 is probably **not an error**: Shop Manager counts
*orders*, `transaction_sold_count` counts *line items*. $2,241/135 = $16.60
per shirt (plausible) vs $18.68 per order. The 7-day 42 vs 44 is a
sub-day snapshot lag.

## Shops measured (all via official API, 2026-07-26)

| Shop | shop_id | Created | `transaction_sold_count` | `review_count` | ratio |
|---|---|---|---|---|---|
| WarungBeads | 20230277 | 2019-05-15 | 1,588,493 | 130,279 | 12.19 |
| OldSchoolCulture | 41371150 | 2023-02-22 | 90,585 | 13,723 | 6.60 |
| RetroFluent | 60918381 | 2025-07-15 | 6,108 | 749 | 8.15 |
| OldRetroTees | 64063130 | 2026-01-13 | 254 | 22 | 11.55 |

Where the two methods disagree, the disagreement tracks review volume:
RetroFluent June 2026 was eRank 433 vs Method A 424 (-2.1%, plenty of
reviews), while OldRetroTees 7-day was 42 vs 58 (+38%, 5 reviews).

## API cost

| Task | Calls |
|---|---|
| Shop header (totals, creation date) | 1 |
| Full review walk (`limit=100`) | `ceil(review_count/100)` - 1,303 for WarungBeads, 138 for OldSchoolCulture, 8 for RetroFluent, 1 for OldRetroTees |
| Monthly histogram by sampling (`limit=1`, every 500th offset, interpolate) | 262 for WarungBeads - accurate enough for a monthly/quarterly chart |
| Daily snapshot | 1 per shop per day |

Etsy **does not publish a rate-limit table**. Limits are per-API-key, shown
in the Developer Portal (`etsy.com/developers/your-apps`), enforced on a
rolling 24h sliding window, and raised on request by emailing
developer@etsy.com with an app description and projected call volume. The
5 req/s + 5,000/day figures recorded elsewhere in this repo are what this
project's key was observed to have - **check the portal for the real
current number before sizing anything on them.**

### Snapshotting many shops in one call

`GET /listings/batch` accepts **up to 100 `listing_ids`** (hard cap - 150
returns `Array only allows [100] elements`) and supports `includes=Shop`,
which nests the *full* shop object in every row: `shop_id`, `shop_name`,
`transaction_sold_count`, `review_count`, `review_average`,
`created_timestamp`, `listing_active_count`, `num_favorers`,
`currency_code`, `shop_location_country_iso`. Verified:

- 100 listing ids taken straight from search results -> **78** unique shops
  (some shops repeat in one result page).
- 100 listing ids deliberately picked one-per-shop -> **exactly 100 shops,
  zero misses**.
- `includes=Images,Shop` works together; images are unaffected.

There is no shop-level batch endpoint and no way to enumerate shops:
`GET /shops` requires `shop_name` (400 otherwise), and `/shops/batch`
400s because the router parses `batch` as a `shop_id`.

**This makes snapshots nearly free, and one of them literally free:**
`_batch_fetch` in `models/etsy_api_listing_source.py` already calls this
exact endpoint with `includes=Images`. Adding `,Shop` costs **zero extra
requests** and yields ~78 shop snapshots per search page the user browses.

| Shops snapshotted daily | Calls/day (100/call) | % of a 5,000/day quota |
|---|---|---|
| 10,000 | 100 | 2% |
| 50,000 | 500 | 10% |
| 100,000 | 1,000 | 20% |

For scale: eRank's "Global Rank" for a tiny shop was 885,647, so its
database holds at least ~886k shops (Etsy had ~5.6M active sellers in
Q1 2026). A full pass over 886k shops is only ~8,860 calls. eRank's
advantage is therefore **a negotiated quota, not a cleverer method** - the
endpoint above is enough to do it at their scale. (Unverified whether eRank
actually uses this path; they may also lean on OAuth-connected user shops
or on scraping.)

### The two hard parts (neither is the snapshot)

1. **Discovery.** Search depth is capped (`MAX_PAGES=40`), so one keyword
   surfaces only so many shops. Broad coverage needs a wide keyword list -
   see `etsy_keyword_search_volume_research.md`. Cost is ~39 new shops per
   call (2 calls per page of ~78 shops), so ~1,280 calls to discover 50,000
   shops - a one-off, not a daily cost.
2. **Stale `listing_id`s.** Batch-snapshotting a shop requires holding a
   live listing id from it; if that listing sells out or is removed, the
   shop silently drops out of the snapshot. Mitigation: store 3-5 spare ids
   per shop and fall back to `/shops/{shop_id}` for any that fail.
   **Untested:** whether `/listings/batch` returns inactive listings at all.

`price` is already present on every listing row
(`{'amount': 4500, 'divisor': 100, 'currency_code': 'USD'}`), so the
`views x conv_rate(price)` model from `etsy_conversion_research.md` needs
no extra calls either - just a new field on `Listing`.

The full walk is worth its cost once: each review carries `listing_id`, so
the same data also yields **per-listing sales attribution** (real
attribution, not the `views x conv_rate` estimate from
`etsy_conversion_research.md`).

## Plan

### Now - Method A only

Method A is the only one that works from a cold start: it returns a
complete monthly history back to the shop's creation date on the first
scan, with no waiting period. Steps:

1. `GET /shops?shop_name=X` -> `shop_id`, `transaction_sold_count`,
   `review_count`, `created_timestamp`.
2. Walk `GET /shops/{id}/reviews` (full walk if `review_count` is small,
   sampled grid if large), keep `(created_timestamp, listing_id)`.
3. Bucket by month, multiply by `ratio`.
4. Cache the result - reviews are append-only, so refreshes only need to
   read from `offset=0` until reaching a timestamp already stored.

Display honestly, because the ground-truth check above shows where it
breaks:
- Do not render months before the shop's first review as "0 sales" -
  render them as *unknown*. That is the single largest error source
  (OldRetroTees showed 0 for two months of real selling).
- Suppress or widen the estimate on shops where `ratio` implies a quantum
  larger than the number being shown.
- Label it an estimate. It is.

### Future - start snapshots now, go hybrid later

Method B is strictly more accurate but only for periods after collection
begins, so **the sooner a daily snapshot job starts, the more valuable the
data becomes**. One call per shop per day is negligible against the 5,000
budget.

Target end state:

```
month before tracking started  ->  Method A (reviews)
month after  tracking started  ->  Method B (snapshot deltas)
```

with the seam marked in the UI, because the two do not measure identically
(Method B counts line items; Method A is calibrated to the same lifetime
line-item counter, so they are at least the same unit).

Method A also stays useful permanently as a **backfill for newly added
shops** - a shop added to the watchlist in a year still gets its full
history immediately, then accumulates accurate snapshot data going forward.

### Not yet decided

- Where this surfaces in the UI (shop analyzer page vs a column in the
  existing listing grid vs a competitor-shop page).
- Whether snapshots run from cron/launchd (survives the app being closed)
  or a background thread in `app.py` (simpler, but leaves gaps).
- Watchlist vs auto-tracking every shop seen in search results.
- Whether this stays single-user. The 5,000/day budget is per API key;
  a multi-user deployment needs a shared cache and probably a commercial
  Etsy app with raised limits.

None of this is wired into the codebase yet. As of writing there is no
database and no scheduler in this project (persistence is JSON files only),
and `Listing` in `models/listing_source.py` carries no `price` field - all
of which a real implementation would need to add.
