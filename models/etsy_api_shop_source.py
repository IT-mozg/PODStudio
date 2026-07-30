# -*- coding: utf-8 -*-
"""
ShopSource implementation backed by the official Etsy Open API v3
(GET /shops, GET /shops/{shop_id}, GET /shops/{shop_id}/reviews) - same key,
same transport (models/etsy_api_client.py) as EtsyApiListingSource.

STATUS: verified against a real "Personal Access" key on 2026-07-27. What
Etsy's shop endpoints do and don't allow, confirmed live - read this before
changing anything here:

  1. `GET /shops` REQUIRES `shop_name` (400 without it). There is no way to
     enumerate shops, no `sort_on`, and no filter by sales/rating/age.
     "Top sellers on Etsy" is therefore not answerable from this API at all,
     only "top among the shops whose name matched this string".
  2. Matching is Etsy's own fuzzy match, not a prefix match: shop_name=
     "OldRetro" returned OldRetro, OldRetroTees, OldRetroGold - but also
     OldMagazinesandComic and GoldenDustVintage. Hence _rank(): exact name
     match first, then real prefix matches, then whatever else Etsy threw
     in, each group by lifetime sales. Etsy's own order is useless here -
     shop_name="cat" (count=20,230) came back oldest-first, led by 2007
     shops with no sales.
  3. There is NO shop batch endpoint: `/shops/batch` 400s because the router
     parses "batch" as a shop_id. So N shops = N requests, which is what
     MAX_LOOKUPS_PER_CALL exists to bound.
  4. Fields that do come back per shop (all real): shop_id, shop_name,
     transaction_sold_count, review_count, review_average,
     listing_active_count, created_timestamp, num_favorers,
     icon_url_fullxfull, url, title, currency_code, digital_listing_count,
     shop_location_country_iso.
  5. Like listing titles, shop names/titles arrive with literal HTML
     entities in them, so they need html.unescape().
  6. `GET /shops/{id}/reviews` - measured live 2026-07-30, and every one of
     these shapes sales_history() below:
       - rows come back **newest first**, so offset=review_count-1 is the
         oldest review in one request;
       - `min_created`/`max_created` (unix seconds) really do filter, and
         `count` reflects the filter. Verified against a control request with
         a nonsense parameter, which Etsy ignores silently - the usual way
         this kind of check gives a false positive;
       - `count` is not capped: a 130,549-review shop reported 2,326 for a
         single month;
       - `limit` maxes out at 100 (`limit=200` -> 400 "Value must be <= 100");
       - there is no offset ceiling - offset=130,548 answered in 0.5 s;
       - a review has **no** `review_id`; its identity is `transaction_id`.

Revenue and "growth %" are not available and cannot be derived from a single
call - see issues #80/#81. Sales-per-month *is* derivable, but only as an
estimate - see sales_history() and etsy_shop_sales_history_research.md.
"""

import html
import threading
import time
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from .etsy_api_client import API_BASE, EtsyApiClient, EtsyApiError
from .lru import LruCache
from .shop_source import MonthlySales, SalesHistory, Shop, ShopSource

SEARCH_LIMIT = 100  # rows per name search - Etsy's documented maximum, and
                    # one request either way, so there is no reason to ask
                    # for fewer
MAX_LOOKUPS_PER_CALL = 25  # get_by_ids() has to issue one request per shop
                           # (see note 3 above), so hydrating a long tracked
                           # list would both stall the page and eat into the
                           # 5 req/s budget. Cached shops are free and don't
                           # count against this.
# Cache ceilings. Both caches were unbounded dicts that nothing ever cleared,
# and a search result holds up to SEARCH_LIMIT Shop objects - so a session
# spent trying different shop names grew the process without limit. These
# sizes keep every realistic revisit (paging back to an earlier query, the
# tracked list) a cache hit.
SEARCH_CACHE_SIZE = 64   # distinct name queries retained
SHOP_CACHE_SIZE = 1000   # individual shop records retained

# --- sales_history() ---
HISTORY_MONTHS = 12
REVIEWS_PAGE_LIMIT = 100  # Etsy's hard maximum (note 6 above)
# Mode B costs 1 + HISTORY_MONTHS requests whatever the shop's size, while
# mode A costs ceil(review_count / REVIEWS_PAGE_LIMIT). This is the exact
# crossover: below it, reading the reviews outright is cheaper (a 27-review
# shop costs one request, not thirteen); above it, mode A would grow without
# bound - 1,306 requests on a 130k-review shop.
REVIEW_WALK_MAX = REVIEWS_PAGE_LIMIT * (1 + HISTORY_MONTHS)  # 1300
HISTORY_CACHE_SIZE = 200  # a SalesHistory is 12 small records, so this costs
                          # far less memory than the Shop cache next to it


@dataclass
class _HistoryEntry:
    """What sales_history() caches: the *review counts*, not the sales.

    Deliberately the raw ingredient rather than the finished answer. Sales are
    counts x ratio, and ratio moves every time the shop sells or is reviewed,
    so caching the finished numbers froze all twelve bars until the process
    restarted. Counts, by contrast, are stable for any month that has ended.

    Self-contained on purpose: it carries the two shop counters as well, so
    answering from it needs no request at all, not even for the shop record.

    Three fields decide what a refresh costs:

      * `fetched_at` first, as a calendar date: an entry measured earlier
        today is served as-is, because these numbers are a monthly estimate
        and re-deriving them several times a day buys nothing against a
        5,000/day key. UTC, to match the month buckets - the cutover is
        midnight UTC, not local midnight.
      * `review_count` decides the rest once the day has turned. The shop
        record is re-read then anyway, so comparing is free, and if the two
        match, not one review has been written since - no bucket can have
        moved and no further request is needed.
      * `fetched_at` again, as a timestamp, when they don't match: a month
        whose end is later was still open when it was measured, so its count
        can have grown. Every other month is final - a review written in
        August carries an August timestamp and cannot land in July's bucket."""

    counts: dict[str, int]      # "YYYY-MM" -> reviews in that month
    first_review: int | None    # oldest review, or a bound inside its month
    review_count: int           # the shop's totals when counts were taken -
    total_sales: int            # both, so a same-day hit needs no shop request
    fetched_at: int             # unix seconds


def _month_key(timestamp: int) -> str:
    moment = datetime.fromtimestamp(timestamp, timezone.utc)
    return f"{moment.year:04d}-{moment.month:02d}"


def _month_bounds(year: int, month: int) -> tuple[int, int]:
    """(start, end) unix seconds, end being the start of the next month."""
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    end = datetime(next_year, next_month, 1, tzinfo=timezone.utc)
    return int(start.timestamp()), int(end.timestamp())


def _recent_months(count: int) -> list[tuple[int, int, str]]:
    """The last `count` calendar months in UTC, oldest first, as
    (start, end, "YYYY-MM"). The last entry is the current, partial month -
    the chart highlights it as such."""
    now = datetime.now(timezone.utc)
    months = []
    for back in range(count - 1, -1, -1):
        year, month = divmod(now.year * 12 + now.month - 1 - back, 12)
        month += 1
        start, end = _month_bounds(year, month)
        months.append((start, end, f"{year:04d}-{month:02d}"))
    return months


def _to_sales_history(shop_id: str, entry: "_HistoryEntry",
                      months: list) -> SalesHistory:
    """Turn stored review counts into the estimate the UI renders.

    ratio lives here rather than in the entry because it is derived, not
    measured: storing it would mean two things to keep in step."""
    ratio = entry.total_sales / entry.review_count if entry.review_count else 0.0
    known_from = (None if entry.first_review is None
                  else _first_trustworthy_month(months, entry.first_review))
    return SalesHistory(
        shop_id=shop_id,
        ratio=ratio,
        months=[MonthlySales(
            month=key,
            sales=round(entry.counts.get(key, 0) * ratio),
            known=known_from is not None and i >= known_from,
        ) for i, (_, _, key) in enumerate(months)],
    )


def _same_utc_day(a: int, b: int) -> bool:
    return (datetime.fromtimestamp(a, timezone.utc).date()
            == datetime.fromtimestamp(b, timezone.utc).date())


def _first_trustworthy_month(months: list, first_review: int) -> int | None:
    """Index of the earliest month whose sales this method can actually see.

    Sales made before a shop's first review are invisible here, so the month
    that review landed in is only partly covered and every month before it not
    at all. Both must render as unknown rather than 0 - measured on a real
    shop, that mistake turned two months of confirmed selling into zeroes."""
    for i, (start, _, _) in enumerate(months):
        if first_review <= start:
            return i
    return None


class EtsyApiShopSource(ShopSource):
    """Shop source backed by the official Etsy API, with a process-lifetime
    cache.

    Shop records are cached far more aggressively than listing pages: a
    shop's name/creation date never change and its sales/review counters
    move slowly, while the cost of a miss is a full request per shop. Entries
    are never invalidated by age - restart the app for fresh numbers - but
    the caches are size-bounded (see SEARCH_CACHE_SIZE/SHOP_CACHE_SIZE), so
    a long session evicts the least recently used rather than growing
    forever. (Once Epic E's database lands, this cache is what becomes a
    `shops` table - see #26.)

    sales_history() is the one exception to "never invalidated by age", and
    has to be: its numbers are pinned to a rolling twelve-month window and to
    a ratio built from two counters that move whenever the shop sells. It
    expires by calendar day - measured earlier today is good enough for a
    monthly estimate - and past that refreshes the shop record and re-reads
    any month that was still open when it was last measured. See
    _HistoryEntry."""

    def __init__(self, api_key_provider: Callable[[], str],
                 shared_secret_provider: Callable[[], str]):
        self._client = EtsyApiClient(api_key_provider, shared_secret_provider)
        self._by_id: LruCache = LruCache(SHOP_CACHE_SIZE)
        # name query (lowercased) -> (shops, total count reported by Etsy).
        # The UI re-issues the same query on re-render/tab switch, and this
        # keeps that from costing a live request every time.
        self._search_cache: LruCache = LruCache(SEARCH_CACHE_SIZE)
        # shop_id -> _HistoryEntry (review counts, not finished sales).
        self._history_cache: LruCache = LruCache(HISTORY_CACHE_SIZE)
        # Held across the network call, not just around the dict mutation -
        # same reasoning as EtsyApiListingSource._lock: two concurrent
        # lookups of the same shop should cost one request, not two.
        self._lock = threading.RLock()
        # sales_history() is the one operation here that costs up to 14
        # requests (~4 s), and holding _lock for that long would stall every
        # search and every tracked-list hydration behind it. Hence a second
        # lock, held for the whole estimate while _lock is taken and released
        # inside it for the shop record. Ordering is always history -> main
        # and never the reverse: no other method touches _history_lock, so
        # the pair cannot cycle.
        #
        # Two costs this deliberately accepts, both bounded and neither a
        # correctness problem:
        #   - history lookups for *different* shops serialise behind each
        #     other. The alternative, a lock per shop id, is its own unbounded
        #     map to evict.
        #   - the "concurrent lookups of one shop cost one request" property
        #     above does not extend to a *warm* estimate, where _refresh_shop()
        #     bypasses the cache on purpose: N simultaneous callers spend N
        #     shop requests, serialised rather than parallel. Left alone
        #     because the only caller is a detail page that issues exactly
        #     one, and coalescing would mean a staleness window - the very
        #     thing this method exists to avoid.
        self._history_lock = threading.RLock()

    # ---------------- ShopSource ----------------

    def search(self, name: str) -> tuple[list[Shop], int]:
        name = name.strip()
        if not name:
            # No query, no request: Etsy has no "list all shops" mode, so an
            # empty search is answered locally rather than with a 400.
            return [], 0
        key = name.lower()
        with self._lock:
            cached = self._search_cache.get(key)
            if cached is not None:
                return list(cached[0]), cached[1]
            params = urllib.parse.urlencode({"shop_name": name, "limit": SEARCH_LIMIT})
            data = self._client.get(f"{API_BASE}/shops?{params}")
            shops = [self._to_shop(row) for row in data.get("results", [])
                     if row.get("shop_id")]
            shops = self._rank(shops, name)
            # Etsy's `count` is a total-matches number, but it can come back
            # *smaller* than the number of rows it just returned (confirmed
            # live: shop_name="OldRetro" -> count=5 alongside 6 results;
            # shop_name="cat" -> count=20,230 alongside 100). Clamp it so the
            # UI can never say "5 found" above 6 rows.
            total = max(data.get("count") or 0, len(shops))
            self._search_cache[key] = (shops, total)
            for shop in shops:
                self._by_id.setdefault(shop.shop_id, shop)
            return list(shops), total

    def get_by_id(self, shop_id: str) -> Shop | None:
        shop_id = str(shop_id or "").strip()
        if not shop_id:
            return None
        with self._lock:
            cached = self._by_id.get(shop_id)
            if cached is not None:
                return cached
            try:
                data = self._client.get(f"{API_BASE}/shops/{urllib.parse.quote(shop_id)}")
            except EtsyApiError as e:
                if e.status == 404:
                    # A shop id that doesn't exist is an answer, not a
                    # failure - let the caller return 404 instead of 502.
                    return None
                raise
            if not data.get("shop_id"):
                return None
            shop = self._to_shop(data)
            self._by_id[shop.shop_id] = shop
            return shop

    def get_by_ids(self, shop_ids: list[str]) -> dict[str, Shop]:
        """Same contract as the base implementation, but bounded: at most
        MAX_LOOKUPS_PER_CALL shops are actually fetched from Etsy per call
        (cache hits are unlimited). Ids past that budget are left out of the
        result - a partially-populated tracked list beats a page that hangs
        for half a minute or trips the rate limit.

        The lock is held across the whole loop, not re-taken per id: dropping
        it between the cache check and get_by_id() let two threads both miss
        on the same shop and both request it, which is exactly what the cache
        exists to prevent against a 5 req/s key. It is an RLock, so
        get_by_id() re-entering is fine, and it was already held across every
        one of these network calls anyway - the second caller now waits and
        reads the first one's result instead of duplicating it."""
        found: dict[str, Shop] = {}
        budget = MAX_LOOKUPS_PER_CALL
        with self._lock:
            for shop_id in dict.fromkeys(str(i) for i in shop_ids if i):
                cached = self._by_id.get(shop_id)
                if cached is not None:
                    found[shop_id] = cached
                    continue
                if budget <= 0:
                    continue
                budget -= 1
                shop = self.get_by_id(shop_id)
                if shop:
                    found[shop_id] = shop
        return found

    def sales_history(self, shop_id: str) -> SalesHistory | None:
        """Estimated sales for each of the last HISTORY_MONTHS calendar
        months, via the review-histogram method (issue #45).

            ratio         = transaction_sold_count / review_count
            Sales(month)  = Reviews(month) * ratio

        Etsy publishes one lifetime sales counter and no monthly breakdown at
        all, so the *shape* of the curve is borrowed from the reviews, which
        are timestamped and public. Validated against the owner's own Shop
        Manager numbers: 104 estimated vs 120 real orders over 30 days (and
        the same figure ListingView shows). It is an estimate; the payload
        says so and the UI must too.

        Two modes for the first, cold computation, picked by review_count
        because neither is cheap over the whole range - see REVIEW_WALK_MAX.
        Both produce identical numbers; only the request count differs, and
        it is min(ceil(review_count / 100), 13).

        Later calls cost progressively less, and on most days nothing:

          * measured earlier today -> served from the entry, no request;
          * measured on an earlier day, no new review since -> one request,
            the shop record that proved it;
          * new reviews since -> one more, for the month still open.

        That works because a review written in August carries an August
        timestamp and can never land in July's bucket, so a month that has
        ended never changes again.

        None means "no estimate", never "zero sales": either there is no such
        shop, or it has no reviews, which leaves ratio undefined."""
        shop_id = str(shop_id or "").strip()
        if not shop_id:
            return None
        with self._history_lock:
            months = _recent_months(HISTORY_MONTHS)
            cached = self._history_cache.get(shop_id)
            if cached is not None and _same_utc_day(cached.fetched_at, int(time.time())):
                return _to_sales_history(shop_id, cached, months)
            shop = self._shop_for_estimate(shop_id, cached)
            if not shop or shop.review_count <= 0:
                return None
            entry, shop = self._refresh_history(shop, shop_id, months, cached)
            self._history_cache[shop_id] = entry
            return _to_sales_history(shop_id, entry, months)

    # ---------------- internal ----------------

    def _refresh_shop(self, shop_id: str) -> Shop | None:
        """get_by_id(), but guaranteed to hit Etsy rather than the cache.

        The estimate divides by review_count and multiplies by
        transaction_sold_count, and _by_id never expires by design, so reusing
        a cached record would pin the ratio to whatever it was the first time
        this shop was looked at - a shop that sold all week would keep
        reporting the same twelve numbers. One request, and it refreshes the
        counters the rest of the page shows too."""
        shop_id = str(shop_id or "").strip()
        if not shop_id:
            return None
        with self._lock:
            self._by_id.pop(shop_id, None)
            return self.get_by_id(shop_id)

    def _shop_for_estimate(self, shop_id: str,
                           cached: "_HistoryEntry | None") -> Shop | None:
        """The shop record the estimate will be built on.

        A warm entry always gets a refetched record: comparing review_counts
        is the staleness check, and checking a cached number against itself
        proves nothing.

        A cold one reuses whatever is cached, because the detail page's own
        /shops/<id> call has almost always just stored it and refetching bills
        the same record twice for one page open. The exception is a cached
        record claiming zero reviews. That would return None here, cache
        nothing, and take this same path again on every later call - so a shop
        whose record was captured before its first review (which `search()`
        does, via setdefault, for every result) reported "no reviews" for the
        life of the process while Etsy showed dozens."""
        if cached is not None:
            return self._refresh_shop(shop_id)
        shop = self.get_by_id(shop_id)
        if shop is not None and shop.review_count <= 0:
            return self._refresh_shop(shop_id)
        return shop

    def _refresh_history(self, shop: Shop, shop_id: str, months: list,
                         entry: "_HistoryEntry | None") -> tuple["_HistoryEntry", Shop]:
        """Bring a cached entry up to date, or build one from scratch.

        Returns the shop alongside, because measuring can discover that the
        record it started from was stale and replace it.

        A cold entry costs the full walk/count. A warm one costs nothing while
        review_count is unchanged, and otherwise one request per month that
        was still open when it was last measured. An entry whose first_review
        never resolved is rebuilt rather than patched: there is nothing to
        extend."""
        now = int(time.time())
        if entry is None or entry.first_review is None:
            return self._measure_history(shop, shop_id, months, now)
        # Months that dropped out of the window are dropped with it; the ones
        # that scrolled in start at zero and are filled below if they can have
        # anything in them.
        counts = {key: entry.counts.get(key, 0) for _, _, key in months}
        if entry.review_count != shop.review_count:
            for start, end, key in months:
                if key not in entry.counts or end > entry.fetched_at:
                    counts[key] = self._month_review_count(shop.shop_id, start, end)
        # Otherwise not one review has been written since these counts were
        # taken, so every bucket - including the open one, and including a
        # month that just scrolled into the window - still holds what it held.
        return _HistoryEntry(counts, entry.first_review, shop.review_count,
                             shop.total_sales, now), shop

    def _measure_history(self, shop: Shop, shop_id: str, months: list,
                         now: int) -> tuple["_HistoryEntry", Shop]:
        """The cold computation, and the one place the walk/count choice is
        made.

        That choice is made on `shop.review_count`, which on this path can
        come from a cached record. If the record understates the shop badly
        enough, the walk hits its page cap and returns only the newest
        REVIEW_WALK_MAX-ish reviews - which on a large shop span days, leaving
        every month looking like it predates the first review and the chart
        empty. So a capped walk is treated as proof the record was stale:
        refetch it and count instead, which is size-independent."""
        if shop.review_count <= REVIEW_WALK_MAX:
            counts, first_review, capped = self._sales_by_walking(shop, months)
            if not capped:
                return _HistoryEntry(counts, first_review, shop.review_count,
                                     shop.total_sales, now), shop
            shop = self._refresh_shop(shop_id) or shop
        counts, first_review = self._sales_by_counting(shop, months)
        return _HistoryEntry(counts, first_review, shop.review_count,
                             shop.total_sales, now), shop

    def _reviews(self, shop_id: str, **params) -> dict:
        query = urllib.parse.urlencode(params)
        return self._client.get(
            f"{API_BASE}/shops/{urllib.parse.quote(shop_id)}/reviews?{query}")

    def _month_review_count(self, shop_id: str, start: int, end: int) -> int:
        """How many reviews fall in [start, end) - one request, no rows.

        max_created is inclusive and `end` is the next month's start, hence
        end - 1: the last second of the month belongs here, midnight belongs
        to the next bucket."""
        return self._reviews(shop_id, limit=1, min_created=start,
                             max_created=end - 1).get("count") or 0

    def _sales_by_walking(self, shop: Shop, months: list
                          ) -> tuple[dict, int | None, bool]:
        """Mode A: read the reviews themselves and bucket them locally.

        Cheaper than mode B for any shop under REVIEW_WALK_MAX reviews, and it
        answers the "when was the first review" question for free - the walk
        ends on the oldest one.

        Returns (counts, oldest review timestamp or None, hit the page cap).
        The last one matters: reaching the cap means the shop has more reviews
        than the record that sent us here claimed, so neither the counts nor
        the "oldest" are the whole story and the caller must not trust them."""
        counts: dict[str, int] = {key: 0 for _, _, key in months}
        oldest: int | None = None
        offset = 0
        capped = True
        # One page more than REVIEW_WALK_MAX needs: review_count comes from a
        # shop record that can lag the shop's real total.
        for _ in range(REVIEW_WALK_MAX // REVIEWS_PAGE_LIMIT + 1):
            rows = self._reviews(shop.shop_id, limit=REVIEWS_PAGE_LIMIT,
                                 offset=offset).get("results") or []
            for row in rows:
                created = row.get("created_timestamp")
                if not created:
                    continue
                if oldest is None or created < oldest:
                    oldest = created
                key = _month_key(created)
                if key in counts:
                    counts[key] += 1
            if len(rows) < REVIEWS_PAGE_LIMIT:
                capped = False  # a short page is the end of the reviews
                break
            offset += len(rows)
        return counts, oldest, capped

    def _sales_by_counting(self, shop: Shop, months: list) -> tuple[dict, int | None]:
        """Mode B: never download a review, just ask how many match a date
        range (note 6 in the module docstring). Flat 13 requests however big
        the shop is.

        The 13th is what makes the result honest: it asks whether *any*
        review predates the window. If one does, every month shown is past
        the shop's blind spot and trustworthy. If none does, the first month
        with reviews is the month the shop's very first review landed, and
        that month plus everything before it is unknowable - which the
        12 counts already tell us, at no extra cost.

        Returns (counts, first review timestamp) like mode A does, except that
        counting never sees an exact timestamp - only which month it falls in.
        The value returned is therefore a *bound* that lands in the right
        month, which is all _first_trustworthy_month() compares against, and
        unlike a month index it stays correct as the window slides forward."""
        counts = {key: self._month_review_count(shop.shop_id, start, end)
                  for start, end, key in months}
        window_start = months[0][0]
        before = self._reviews(shop.shop_id, limit=1,
                               max_created=window_start - 1).get("count") or 0
        if before > 0:
            # Somewhere before the window - the exact moment doesn't matter,
            # only that every month on screen is safely after it.
            return counts, window_start - 1
        for start, _, key in months:
            if counts[key] > 0:
                # The first review is inside this month, so the month is only
                # partly covered; +1 puts the bound past its start, which is
                # what makes _first_trustworthy_month skip it.
                return counts, start + 1
        return counts, None

    @staticmethod
    def _to_shop(row: dict) -> Shop:
        return Shop(
            shop_id=str(row.get("shop_id") or ""),
            name=html.unescape(row.get("shop_name") or ""),
            total_sales=row.get("transaction_sold_count") or 0,
            review_count=row.get("review_count") or 0,
            review_average=row.get("review_average") or 0.0,
            listing_count=row.get("listing_active_count") or 0,
            created_timestamp=row.get("created_timestamp") or 0,
            num_favorers=row.get("num_favorers") or 0,
            icon_url=row.get("icon_url_fullxfull") or "",
            url=row.get("url") or "",
        )

    @staticmethod
    def _rank(shops: list[Shop], query: str) -> list[Shop]:
        """Our own relevance order, because Etsy provides none (note 2 in
        the module docstring): exact name match, then names starting with
        the query, then the rest; biggest shop first within each group."""
        needle = query.strip().lower()

        def sort_key(shop: Shop) -> tuple[int, int]:
            name = shop.name.lower()
            if name == needle:
                group = 0
            elif name.startswith(needle):
                group = 1
            else:
                group = 2
            return group, -shop.total_sales

        return sorted(shops, key=sort_key)
