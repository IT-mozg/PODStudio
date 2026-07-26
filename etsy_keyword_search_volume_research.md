# Etsy keyword "search volume" - where the numbers come from, and how to build our own

Research notes on how third-party Etsy analytics tools (eRank, Alura,
EverBee/ListingView) display "Avg. Searches" / "Search Volume" per keyword,
and what a legitimate path looks like for building the same kind of feature
into POD Studio for many concurrent users - not just one seller's own
lookups.

Companion to [etsy_conversion_research.md](etsy_conversion_research.md)
(views/sales/conv-rate reverse-engineering) - same goal, different metric.

## The one real, first-party source: Etsy's own Marketplace Insights

Etsy shipped **Marketplace Insights** into Shop Manager in 2026
(Shop Manager -> Stats -> Marketplace Insights). Confirmed by screenshots
of our own account: for "personalized gift" it shows **113.8k searches /
1.4M results** over the last 30 days, plus a table of "Similar search
terms" each with its own real searches/results count, plus a day-by-day
30-day trend chart.

- These are **real, exact numbers** from Etsy itself - not an estimate.
- **UI only, no public API.** Checked the Etsy Open API v3 reference and
  the `etsy/open-api` GitHub changelog - no endpoint for this exists.
- **Rate-limited per shop**: the UI shows "N remaining" (confirmed 14/15
  remaining after one search) - free tier is ~15 searches/week per shop,
  unlimited with an Etsy Plus subscription (~$10/mo).
- Only a rolling **30-day window** - no long history/seasonality from this
  source alone.
- One keyword typed in gives back ~20 "similar search term" rows too
  (paginated, 20 pages seen) - so one query yields a small neighborhood of
  related terms, not just the one you typed.

This is the only source where the number is *known* to be real. Everything
below is estimation.

## How eRank/Alura/etc. actually get their numbers (not from Etsy's API)

eRank's own help docs state it outright: *"Since eRank is an independent
tool, we rely on data from third-party data analytics companies to provide
estimates for search volume and engagement."* Their blog post about
Marketplace Insights also says they're "reviewing how best to align our
figures with theirs [Etsy's]" - i.e. their existing numbers are a
*different, older, independent estimate*, not sourced from Marketplace
Insights.

Evidence this is licensed clickstream/panel data, not Etsy telemetry:
- eRank's own "Search Trends" chart has toggle checkboxes for **Etsy,
  Amazon, eBay, and Google simultaneously**. No Etsy-shop-sync could ever
  reveal Amazon/eBay search behavior - only a cross-site browser/clickstream
  panel (the same kind of data broker Ahrefs/Semrush use for Google
  estimates) can span multiple unrelated domains at once.
- The exported CSV (`eRank - Keyword Tool - *.csv`) has a `Google Searches`
  column with values like 40500, 110000, 4400, 2900, 320, 880... These are
  *exactly* Google Ads Keyword Planner's standard geometric bucket values
  (ratio ~1.225: ...320, 390, 480, 590, 720, 880, 1000, 1300, 1600, 1900,
  2400...). That column is real Google Ads API data, kept deliberately
  separate from the "Average Searches" (Etsy) column - the two don't
  correlate by a constant ratio across rows (checked several rows: ratio
  ranges from 0.04 to 0.67), confirming they're two independent pipelines,
  not one derived from the other.
- CTR values in the CSV routinely exceed 100% (109%, 122%, 141%...) -
  further sign these are aggregate model outputs, not raw per-query counts.

Etsy also gives every seller a **Search Terms report** (Shop Manager ->
Stats -> Shop traffic -> "Etsy search") showing the literal queries that
led visits to *that seller's own shop*, with visit counts. This is real
but narrow - it only surfaces terms where the shop already ranks. A
company with a large enough user base (browser extension, or shop-sync
across hundreds of thousands of connected shops) could pool many shops'
real Search Terms/Marketplace-Insights samples into a broader estimate -
plausible explanation for how eRank keeps a ~83k-keyword database fresh,
but unconfirmed.

## Buying licensed clickstream data - checked, not practical at our scale

- **DataForSEO** Clickstream API: cheapest real option, ~$132-180 per
  million keywords, batches of up to 1,000/request. But it's Google/Bing
  clickstream repackaged - no Etsy-specific coverage.
- **Similarweb** Digital Data API: does track cross-site clickstream
  (could plausibly include etsy.com), but Business/Enterprise-only,
  quote-based contracts, commonly $50k+/year. Not viable at our scale.
- Conclusion: no affordable, Etsy-specific licensed clickstream source
  exists for a project this size. Not worth pursuing further unless this
  becomes a funded, larger-scale product.

## eRank's own CSV export - can't be used as a bulk data source

Confirmed: eRank's Export only returns whatever you manually searched -
there is no bulk/full-database export. This is deliberate (letting anyone
export their whole crawled keyword universe would let a competitor clone
the product overnight). Not a viable path to "get everyone's keyword
list."

## Recommended architecture for POD Studio

**Key architectural point: never let concurrent site users hit Google's
API live.** Google Ads Keyword Planner methods are rate-limited to ~1
request/second per developer token regardless of access tier (Basic:
15,000 ops/day; Standard: unlimited ops/day but same 1/sec cap on
Keyword Planning specifically) - 1000 concurrent users each triggering a
live call would blow through that instantly. The correct model (how every
real keyword tool works):

```
Google Ads API (batched, scheduled, server-side)  ->  our own DB
                                                          |
                                    1000 concurrent users read from OUR DB
                                    (normal DB read scaling, no external
                                     rate limit involved at all)
```

Calls are made under one shared service account/developer token (same
pattern as the existing single `etsy_api_key`/`etsy_shared_secret` in
`ui_config.json`, used server-side by `EtsyApiListingSource`) - individual
end users never need their own Google or Etsy accounts.

### Step 1 - discover real candidate keywords (Etsy-only, $0)

Don't guess word combinations. Ground everything in what Etsy sellers/
buyers actually use:

1. **Seed list**: Etsy's `seller-taxonomy/nodes` endpoint gives the full,
   official category tree - a finite, authoritative set of starting terms.
2. **Tag mining**: for each seed, call the already-built
   `/listings/active?keywords=...` (see `models/etsy_api_listing_source.py`),
   pull `tags` off the top results. Sellers pick these tags themselves,
   informed by their own real Etsy stats - a genuine signal, not a guess.
   Count occurrences across many independent sellers/listings (this is
   literally eRank's "Tag Occurrences" CSV column) - higher = more real.
3. **Autocomplete expansion**: feed terms through Etsy's own
   search-suggest/autocomplete endpoint (public, unofficial, powers the
   Etsy.com search box - inherently frequency-ranked).
4. **Recurse** 2-3 levels deep through steps 2-3, dedupe/normalize
   (lowercase, singular/plural merge).

Etsy's own API rate limits (not Google's) are the bottleneck for this
step - check current app-level quota in `etsy_api_listing_source.py`
before estimating throughput.

### Step 2 - bulk volume lookup via Google Ads API

`GenerateKeywordHistoricalMetrics`: up to 10,000 keywords/request, Basic
access allows 15,000 requests/day -> up to 150M keyword-lookups/day of
theoretical capacity, far more than needed. Free (no per-call billing);
gated only by developer-token access-level approval (Basic: apply, ~5
business days review, faster with the brand-verification pilot as of
Jul 2026).

**Without real ad spend on the linked Ads account, results come back as
buckets** (0, 1-100, 100-1K, 1K-10K, 10K-100K, 100K-1M, 1M+) instead of
exact numbers. Google doesn't publish the exact threshold; community
reports cluster around **$5-10/day (~$150-300/mo)** of active campaign
spend to unlock exact figures - ongoing cost, not one-time.

**Buckets are good enough for v1.** The feature's job is relative
ranking/filtering ("is this worth targeting given its competition"), not
lab-precision digits - a decision rarely changes between e.g. 1,300 and
9,400 searches, both land you in the same "yes, target it" bucket. Paired
with the *exact* competition count we already get from
`/listings/active`, a bucket-based demand score is enough to be useful.
Exact numbers are a paid upgrade to layer in later, not a blocker for v1.

### Step 3 - calibrate the Google-volume proxy against real Etsy numbers

Google's numbers are Google-search volume, not Etsy-search volume - a
correlated proxy, not the real Etsy number (ratios vary wildly per
keyword, confirmed 0.04-0.67 range from the CSV). Periodically spend a
small slice of Marketplace Insights' free weekly quota (or get Etsy Plus
to remove the 15/week cap, ~$10/mo) on a rotating sample of top keywords
per category, and fit a per-category correction factor - same technique
already used for the price -> conv-rate bracket table in
[etsy_conversion_research.md](etsy_conversion_research.md). This is
legitimate (our own account, our own quota, no bulk scraping) and keeps
the Google-based estimate honest for Etsy specifically.

**Explicitly avoid**: automating Marketplace Insights past the account's
real allotted quota (ToS risk, and it's a UI built for manual seller
lookups, not bulk export), and any attempt to bulk-extract eRank/Alura's
databases.

## Status

Research only - nothing implemented yet. Next concrete step if picked up:
check `models/etsy_api_listing_source.py` for the app's current Etsy API
rate limits, then prototype Step 1 (taxonomy seed + tag-mining crawler).
