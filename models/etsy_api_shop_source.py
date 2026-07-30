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
import urllib.parse
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
    `shops` table - see #26.)"""

    def __init__(self, api_key_provider: Callable[[], str],
                 shared_secret_provider: Callable[[], str]):
        self._client = EtsyApiClient(api_key_provider, shared_secret_provider)
        self._by_id: LruCache = LruCache(SHOP_CACHE_SIZE)
        # name query (lowercased) -> (shops, total count reported by Etsy).
        # The UI re-issues the same query on re-render/tab switch, and this
        # keeps that from costing a live request every time.
        self._search_cache: LruCache = LruCache(SEARCH_CACHE_SIZE)
        # shop_id -> SalesHistory.
        self._history_cache: LruCache = LruCache(HISTORY_CACHE_SIZE)
        # Held across the network call, not just around the dict mutation -
        # same reasoning as EtsyApiListingSource._lock: two concurrent
        # lookups of the same shop should cost one request, not two.
        self._lock = threading.RLock()
        # sales_history() is the one operation here that costs up to 13
        # requests (~3.5 s), and holding _lock for that long would stall every
        # search and every tracked-list hydration behind it. Its own lock
        # keeps the dedup property (two callers asking for the same shop do
        # the work once) without blocking the fast paths. The two locks are
        # never held at the same time - sales_history() finishes its
        # get_by_id() call, and with it _lock, before taking this one - so
        # there is no lock ordering to get wrong and no deadlock to have.
        # It does serialise history lookups for *different* shops behind each
        # other; acceptable for a single-user tool, and the alternative
        # (a lock per shop id) would be its own unbounded map to evict.
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

        Two modes, picked by review_count, because neither is cheap over the
        whole range - see REVIEW_WALK_MAX. Both produce identical numbers;
        only the request count differs. Cost is
        min(ceil(review_count / 100), 13) requests, so a 27-review shop costs
        one and a 130k-review shop costs thirteen.

        None means "no estimate", never "zero sales": either there is no such
        shop, or it has no reviews, which leaves ratio undefined."""
        shop = self.get_by_id(shop_id)
        if not shop or shop.review_count <= 0:
            return None
        with self._history_lock:
            cached = self._history_cache.get(shop.shop_id)
            if cached is not None:
                return cached
            months = _recent_months(HISTORY_MONTHS)
            if shop.review_count <= REVIEW_WALK_MAX:
                counts, known_from = self._sales_by_walking(shop, months)
            else:
                counts, known_from = self._sales_by_counting(shop, months)
            ratio = shop.total_sales / shop.review_count
            history = SalesHistory(
                shop_id=shop.shop_id,
                ratio=ratio,
                months=[MonthlySales(
                    month=key,
                    sales=round(counts.get(key, 0) * ratio),
                    known=known_from is not None and i >= known_from,
                ) for i, (_, _, key) in enumerate(months)],
            )
            self._history_cache[shop.shop_id] = history
            return history

    # ---------------- internal ----------------

    def _reviews(self, shop_id: str, **params) -> dict:
        query = urllib.parse.urlencode(params)
        return self._client.get(
            f"{API_BASE}/shops/{urllib.parse.quote(shop_id)}/reviews?{query}")

    def _sales_by_walking(self, shop: Shop, months: list) -> tuple[dict, int | None]:
        """Mode A: read the reviews themselves and bucket them locally.

        Cheaper than mode B for any shop under REVIEW_WALK_MAX reviews, and it
        answers the "when was the first review" question for free - the walk
        ends on the oldest one."""
        counts: dict[str, int] = {key: 0 for _, _, key in months}
        oldest: int | None = None
        offset = 0
        # One page more than REVIEW_WALK_MAX needs: review_count comes from a
        # cached shop record and can lag the shop's real total.
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
                break
            offset += len(rows)
        if oldest is None:
            return counts, None
        return counts, _first_trustworthy_month(months, oldest)

    def _sales_by_counting(self, shop: Shop, months: list) -> tuple[dict, int | None]:
        """Mode B: never download a review, just ask how many match a date
        range (note 6 in the module docstring). Flat 13 requests however big
        the shop is.

        The 13th is what makes the result honest: it asks whether *any*
        review predates the window. If one does, every month shown is past
        the shop's blind spot and trustworthy. If none does, the first month
        with reviews is the month the shop's very first review landed, and
        that month plus everything before it is unknowable - which the
        12 counts already tell us, at no extra cost."""
        counts = {key: (self._reviews(shop.shop_id, limit=1, min_created=start,
                                      max_created=end - 1).get("count") or 0)
                  for start, end, key in months}
        window_start = months[0][0]
        before = self._reviews(shop.shop_id, limit=1,
                               max_created=window_start - 1).get("count") or 0
        if before > 0:
            return counts, 0
        for i, (_, _, key) in enumerate(months):
            if counts[key] > 0:
                # i is the month of the first review, so it is itself only
                # partially covered - trust starts after it.
                return counts, i + 1 if i + 1 < len(months) else None
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
