# -*- coding: utf-8 -*-
"""
ShopSource implementation backed by the official Etsy Open API v3
(GET /shops, GET /shops/{shop_id}) - same key, same transport
(models/etsy_api_client.py) as EtsyApiListingSource.

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

Revenue, sales-per-month and "growth %" are not in that list and cannot be
derived from a single call - see issues #80/#81 and
etsy_shop_sales_history_research.md.
"""

import html
import threading
import urllib.parse
from typing import Callable

from .etsy_api_client import API_BASE, EtsyApiClient, EtsyApiError
from .lru import LruCache
from .shop_source import Shop, ShopSource

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
        # Held across the network call, not just around the dict mutation -
        # same reasoning as EtsyApiListingSource._lock: two concurrent
        # lookups of the same shop should cost one request, not two.
        self._lock = threading.RLock()

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

    # ---------------- internal ----------------

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
