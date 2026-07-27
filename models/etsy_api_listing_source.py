# -*- coding: utf-8 -*-
"""
ListingSource implementation backed by the official Etsy Open API v3
(https://developers.etsy.com/documentation/reference/) - no HTML parsing
or browser automation, only documented REST requests with an official
developer key.

The HTTP/auth/retry layer itself lives in models/etsy_api_client.py, shared
with EtsyApiShopSource - this file is only about turning Etsy's listing
endpoints into Listing objects.

STATUS: verified against a real "Personal Access" key. Things the docs
don't make obvious, found by testing directly:

  1. GET /listings/active (search) never embeds images, no matter what
     `includes` value is passed. Images only come back from the *batch*
     endpoint (GET /listings/batch?listing_ids=...&includes=Images), so
     fetching a page of results is a two-step call: search for matching
     listing_ids (in ranked order), then batch-fetch those specific ids
     with images. This also keeps the request count down - one batch call
     for a whole page instead of one image call per listing (relevant
     given the 5 QPS / 5,000 requests-per-day personal-access limit).
  2. Titles come back with literal HTML entities baked in (e.g. "DM&#39;s
     Plans" instead of "DM's Plans"), so they need html.unescape() before
     display - Etsy's API does not do this for you.
  3. Without an explicit sort_on, results are NOT ranked by relevance -
     confirmed live: unsorted results mixed in barely-related items (even
     digital SVG/PNG downloads for a plain "funny cat shirt" search).
     sort_on=score is what actually orders by match quality, and it is
     always sent now. There is no favorites/popularity sort or filter at
     all (min_favorites and is_best_seller/explicit - the query params the
     Etsy *website* uses - are silently ignored by this API); min_price/
     max_price (in whole dollars) do work, confirmed live.
  4. The batch endpoint returns far more per listing than the search grid
     needs, at no extra cost - confirmed live against a real listing:
     description (with the same HTML entities as titles, see 2), price as
     {amount, divisor, currency_code} (2499/100/"USD" - never a float, and
     not always USD), the FULL images array (7 on the listing tested, each
     with url_75x75/url_170x135/url_570xN/url_fullxfull/alt_text/rank -
     _batch_fetch used to keep only images[0]), the canonical url, plus
     taxonomy_id, who_made, when_made, materials, style, processing_min/max,
     is_personalizable, has_variations, quantity, and production_partners.
     All of these now populate Listing's detail-only fields, which is why
     opening a listing's detail page costs zero extra Etsy requests when the
     user got there from a search page (_page_cache already holds the
     fully-populated object).
     production_partners is worth calling out: on a real listing it came
     back as [{"partner_name": "A print shop in New York", "location":
     "Farmingdale, NY"}] - i.e. Etsy publicly names the print shop a
     competitor outsources to. num_favorers is the only public demand signal
     Etsy exposes per listing (1,725 on one listing tested, 0 on another).
     Caveat: materials and style are frequently [] even on complete
     listings, so they must render as "—" rather than a made-up value.
  5. taxonomy_id is a bare number (482), not a category name. Resolving it
     to "Clothing > ... > T-shirts" needs GET /seller-taxonomy/nodes - one
     365 KB call returning all ~3,065 nodes, cacheable for the whole
     process. That lives in models/etsy_taxonomy.py, not here: it's a
     marketplace-wide reference table, not a property of any listing.
  6. /listings/batch is all-or-nothing: if even ONE requested id no longer
     exists, Etsy 404s the entire request instead of omitting that id from
     the results. Body: {"error": "Not all requested listings exist. Missing
     listing_ids: 1."}. Left unhandled, a single deleted listing takes down a
     whole page - most easily the tracked list, where a bookmark outlives the
     listing it points at. _batch_request() reads the missing ids back out of
     that error and retries once without them.

Credentials are passed as callables (api_key_provider/shared_secret_provider),
not plain strings, so they can be read fresh from settings on every request -
the same pattern OpenAIDesignGenerator uses for the OpenAI key. That way
saving new Etsy credentials in Settings takes effect immediately, no restart.

"Популярне"/"Гаряче" badges (is_popular/is_hot): Etsy's API exposes no
bestseller/popularity signal at all (confirmed live - no such field, no
such sort, no such filter). What it does give per listing is num_favorers,
views (both lifetime totals, not "today") and the creation date. See
_compute_calibration() below for exactly how those are turned into badges.

ON HOLD (not wired into the UI): pure percentile calibration turned out to
badge listings with tiny absolute engagement (e.g. 4 favorites over 28
months) whenever the rest of that search's results were even weaker -
needs absolute floors (min favorites, min views) added on top of the
percentile check before it's trustworthy. The calibration/is_popular/
is_hot code is left in place (still runs on every search, just unused) so
it's ready to pick back up - container.listings_payload() simply does not
read is_popular()/is_hot() anymore.
"""

import html
import math
import re
import threading
import time
import urllib.parse
from typing import Callable

from .etsy_api_client import API_BASE, EtsyApiClient, EtsyApiError
from .listing_source import Listing, ListingPage, ListingSource

MAX_PAGES = 40  # a sane browsing depth cap - nobody needs to page to result #35,000
BADGE_PERCENTILE = 0.15  # top ~15% of the calibration sample earns a badge
SHOP_LOOKUP_BUDGET = 5  # max /shops/{id} fallback calls per batch (see
                        # _resolve_shop_name) - Etsy normally embeds the Shop
                        # association, so this only caps the rare fallback
                        # instead of letting one page fire 78 of them
MISSING_ID_RETRIES = 4  # attempts at one batch call while dropping the ids
                        # Etsy reports as missing (see _batch_request). More
                        # than one is needed only because the error body is
                        # truncated; 4 covers far more dead ids than a real
                        # tracked list ever accumulates, and each round
                        # strictly shrinks the id list, so it always ends.


class EtsyApiListingSource(ListingSource):
    """Listing source backed by the official Etsy API.

    A "page" here is a page of search results for the *current* query
    (offset-based pagination on Etsy's side), exposed through the same
    ListingSource interface as any other source. The query itself is set
    at runtime via search(), not fixed at construction, so a search bar
    can point this same instance at a new keyword any time."""

    def __init__(self, api_key_provider: Callable[[], str],
                 shared_secret_provider: Callable[[], str],
                 keywords: str = "", page_size: int = 78):
        self._client = EtsyApiClient(api_key_provider, shared_secret_provider)
        self.page_size = page_size
        self.keywords = ""
        self._has_searched = False
        self._page_cache: dict[int, dict[str, Listing]] = {}
        # get_by_ids() results for ids that don't belong to any page fetched
        # so far (e.g. a listing from history/regenerate that isn't on the
        # currently browsed page) - without this, get_by_ids() would have
        # nowhere to remember them, and every repeat/concurrent lookup of
        # the same "extra" id would re-hit the network.
        self._id_cache: dict[str, Listing] = {}
        # shop_id -> shop_name, populated the first time each shop is seen
        # (see _resolve_shop_name) - a search page commonly has several
        # listings from the same shop, so this keeps it to one extra
        # request per distinct shop rather than one per listing.
        self._shop_name_cache: dict[str, str] = {}
        self._total_count: int | None = None
        self._calibration: dict | None = None
        # Guards _page_cache/_total_count/_calibration AND is held across
        # the network call in get_page()/get_by_ids() - not just around the
        # dict mutation. That serializes every Etsy request this instance
        # makes: with a 5 req/sec cap on the personal-access key, a page
        # load fanning out into N worker threads (e.g. one per selected
        # listing in GenerationQueue) used to fire N concurrent requests
        # for data that was often the exact same page; now the first one
        # fetches and caches it, the rest see the cache and never touch
        # the network at all.
        self._lock = threading.RLock()
        if keywords:
            self.search(keywords)

    # ---------------- search control ----------------

    def search(self, keywords: str) -> None:
        """Point this source at a new query - invalidates cached pages.

        Re-searching the *same* keywords is a no-op: callers hit this on
        every render/filter change, and wiping the cache there would force
        a fresh id+batch round trip (2 API calls) for listings we already
        have, burning the 5 req/s, 5000/day personal-access budget."""
        with self._lock:
            keywords = keywords.strip()
            if keywords == self.keywords and self._has_searched:
                return
            self.keywords = keywords
            self._has_searched = bool(self.keywords)
            self._page_cache = {}
            self._id_cache = {}
            self._total_count = None
            self._calibration = None

    # ---------------- ListingSource ----------------

    def list_pages(self) -> list[ListingPage]:
        if not self._has_searched:
            return []
        with self._lock:
            if self._total_count is None:
                self._page_cache[0], self._total_count = self._fetch(offset=0)
            n_pages = min(max(1, -(-self._total_count // self.page_size)), MAX_PAGES)  # ceil, capped
            return [
                ListingPage(id=str(i),
                            label=f'«{self.keywords}» - {i + 1}',
                            count=len(self._page_cache.get(i, ())) or self.page_size)
                for i in range(n_pages)
            ]

    def get_page(self, page_id: str) -> dict[str, Listing]:
        if not self._has_searched:
            return {}
        idx = int(page_id)
        with self._lock:
            if idx not in self._page_cache:
                self._page_cache[idx], self._total_count = self._fetch(
                    offset=idx * self.page_size)
            return self._page_cache[idx]

    def get_all(self) -> dict[str, Listing]:
        merged: dict[str, Listing] = {}
        for page in self.list_pages():
            merged.update(self.get_page(page.id))
        return merged

    def get_by_ids(self, lids: list[str]) -> dict[str, Listing]:
        """Resolves exactly these ids, preferring whatever is already
        cached (_page_cache from browsing, _id_cache from an earlier
        get_by_ids) - a listing looked up twice, or by several concurrent
        callers at once (e.g. one GenerationQueue worker thread per
        selected listing), costs at most one Etsy request in total, not
        one per lookup. Only what's genuinely missing is batch-fetched -
        in one call, not one per id. Etsy's batch endpoint caps out around
        100 ids per call, so large requests are chunked. The whole
        cache-check-then-fetch step happens under the lock, so a second
        caller blocked on the same missing id sees the first caller's
        result in _id_cache instead of firing its own duplicate request."""
        ids = [str(x) for x in dict.fromkeys(lids) if x]  # dedupe, keep order
        if not ids:
            return {}
        with self._lock:
            by_cache: dict[str, Listing] = dict(self._id_cache)
            for page in self._page_cache.values():
                by_cache.update(page)
            found = {i: by_cache[i] for i in ids if i in by_cache}
            missing = [i for i in ids if i not in by_cache]
            if not missing:
                return found
            fetched: dict[str, Listing] = {}
            for i in range(0, len(missing), 100):
                fetched.update(self._batch_fetch(missing[i:i + 100]))
            self._id_cache.update(fetched)
            return {**found, **fetched}

    # add_source is intentionally not overridden - "uploading a file" makes
    # no sense for an API-backed source, the base ListingSource.add_source()
    # already raises NotImplementedError.

    def is_popular(self, listing: Listing) -> bool:
        if not self._calibration:
            return False
        return math.log1p(listing.num_favorers) >= self._calibration["pop_threshold"]

    def is_hot(self, listing: Listing) -> bool:
        if not self._calibration:
            return False
        return self._composite_score(listing, self._calibration) >= self._calibration["hot_threshold"]

    # ---------------- internal ----------------

    def _resolve_shop_name(self, shop_id: str, budget: list[int]) -> str:
        """shop_id -> shop_name, cached. Must be called while holding
        self._lock (only caller today is _batch_fetch, itself always called
        under the lock).

        Only reached when Etsy fails to embed the Shop association, which
        in practice it does supply - so this is a rare fallback, not the
        normal path. `budget` is a single-element list of remaining allowed
        lookups for the current batch: a page can hold up to 78 listings
        from as many distinct shops, and firing that many sequential
        /shops/{id} calls would blow straight through the 5 req/s cap. Past
        the budget we return "" (blank shop label) rather than rate-limit
        the whole page - a degraded label beats a failed request."""
        if not shop_id:
            return ""
        cached = self._shop_name_cache.get(shop_id)
        if cached is not None:
            return cached
        if budget[0] <= 0:
            return ""
        budget[0] -= 1
        try:
            name = self._client.get(f"{API_BASE}/shops/{shop_id}").get("shop_name", "") or ""
        except EtsyApiError:
            # Don't let one bad shop lookup fail the whole page - but don't
            # cache the failure either: _shop_name_cache is never cleared
            # (not even by search()), so caching "" here would blank that
            # shop for the rest of the process with no retry.
            return ""
        self._shop_name_cache[shop_id] = name
        return name

    # Etsy names the ids it couldn't find in the 404 body, e.g.
    # {"error": "Not all requested listings exist. Missing listing_ids: 1,2."}
    _MISSING_IDS_RE = re.compile(r"Missing listing_ids:\s*([\d,\s]+)")

    def _batch_request(self, ids: list[str]) -> dict | None:
        """The raw batch call, with Etsy's all-or-nothing 404 worked around.

        A single unknown id makes Etsy 404 the WHOLE batch rather than
        omitting it from the results, which would otherwise mean one deleted
        listing breaks an entire page - the tracked list especially, since a
        bookmark long outlives the listing it points at. So on a 404 the
        missing ids are read out of the error body and the call is retried
        without them; the good ids still come back.

        Retried in a bounded loop rather than once, because EtsyApiError
        truncates the response body to 300 chars: with many dead ids in one
        batch the error names only some of them, and a single retry would
        404 again and lose the whole batch. Each round drops the ids that
        round named, so the list converges.

        Returns None when nothing is retrievable (every id missing, or the
        body named none of them - callers turn that into an empty result,
        which is what lets /api/listings/<lid> answer a truthful 404 instead
        of a 502 for a listing that simply doesn't exist)."""
        def call(batch_ids: list[str]) -> dict:
            params = urllib.parse.urlencode({
                "listing_ids": ",".join(batch_ids),
                "includes": "Images,Shop",
            })
            return self._client.get(f"{API_BASE}/listings/batch?{params}")

        remaining = list(ids)
        for _ in range(MISSING_ID_RETRIES):
            try:
                return call(remaining)
            except EtsyApiError as e:
                if e.status != 404:
                    raise
                match = self._MISSING_IDS_RE.search(str(e))
                if not match:
                    return None
                missing = {x.strip() for x in match.group(1).split(",") if x.strip()}
                # A truncated body can end mid-number, so the last entry may
                # be a prefix of a real id rather than the id itself. Dropping
                # it costs nothing (a later round re-reports it if it was
                # wrong) and prevents an unproductive identical retry.
                survivors = [lid for lid in remaining if lid not in missing]
                if not survivors or survivors == remaining:
                    return None
                remaining = survivors
        return None

    def _batch_fetch(self, ids: list[str]) -> dict[str, Listing]:
        """A single call to the batch endpoint (max ~100 ids), with images
        and, where Etsy embeds it, shop info. Etsy's batch endpoint does not
        reliably embed the Shop association on every account tier, so a
        missing "shop_name" here falls back to a separate (cached-by-shop_id)
        /shops/{shop_id} lookup rather than shipping a blank shop name - see
        _resolve_shop_name for why that fallback is budget-capped.

        Ids Etsy doesn't know are simply absent from the result (see note 6
        in the module docstring for why that needs a retry to achieve)."""
        if not ids:
            return {}
        batch_data = self._batch_request(ids)
        if batch_data is None:
            return {}
        by_id = {str(r["listing_id"]): r for r in batch_data.get("results", [])}

        shop_lookup_budget = [SHOP_LOOKUP_BUDGET]
        listings: dict[str, Listing] = {}
        for lid in ids:
            row = by_id.get(lid)
            if not row:
                continue
            images = row.get("images") or []
            remote_img = images[0].get("url_570xN", "") if images else ""
            shop_id = str(row.get("shop_id") or "")
            shop_name = (row.get("shop") or {}).get("shop_name", "") \
                or self._resolve_shop_name(shop_id, shop_lookup_budget)
            price = row.get("price") or {}
            listings[lid] = Listing(
                lid=lid,
                title=html.unescape(row.get("title", "")),
                remote_img=remote_img,
                num_favorers=row.get("num_favorers") or 0,
                views=row.get("views") or 0,
                created_timestamp=row.get("original_creation_timestamp") or 0,
                shop_id=shop_id,
                shop_name=shop_name,
                tags=row.get("tags") or [],
                # Detail-only fields - free, they're already in this response.
                # description carries the same HTML-entity quirk as title
                # ("you&#39;re"), so it needs the same unescape.
                description=html.unescape(row.get("description") or ""),
                price_amount=price.get("amount"),
                price_divisor=price.get("divisor") or 100,
                price_currency=price.get("currency_code") or "",
                images=[img.get("url_570xN", "") for img in images
                        if img.get("url_570xN")],
                url=row.get("url") or "",
                taxonomy_id=row.get("taxonomy_id") or 0,
                who_made=row.get("who_made") or "",
                when_made=row.get("when_made") or "",
                # Often [] even on well-filled listings - the UI must render
                # that as "—", never as an invented material/style.
                materials=row.get("materials") or [],
                style=row.get("style") or [],
                processing_min=row.get("processing_min"),
                processing_max=row.get("processing_max"),
                is_personalizable=bool(row.get("is_personalizable")),
                has_variations=bool(row.get("has_variations")),
                production_partners=[
                    {
                        "name": p.get("partner_name") or "",
                        "location": p.get("location") or "",
                    }
                    for p in (row.get("production_partners") or [])
                ],
            )
        return listings

    def _fetch(self, offset: int) -> tuple[dict[str, Listing], int]:
        search_params = urllib.parse.urlencode({
            "keywords": self.keywords,
            "limit": self.page_size,
            "offset": offset,
            # Without an explicit sort, Etsy does NOT rank by relevance -
            # results include barely-related items (even digital downloads
            # for a physical-product search). sort_on=score is what actually
            # orders by how well a listing matches the query.
            "sort_on": "score",
        })
        search_data = self._client.get(f"{API_BASE}/listings/active?{search_params}")
        total = search_data.get("count", 0)
        ids = [str(r["listing_id"]) for r in search_data.get("results", [])
               if r.get("listing_id")]
        if not ids:
            return {}, total

        # step 2: one batch call to get titles + images for exactly these ids,
        # keeping the ranked order from the search step
        by_id = self._batch_fetch(ids)
        listings = {lid: by_id[lid] for lid in ids if lid in by_id}

        # Badge calibration is computed once per search, from whichever page
        # is fetched first (in practice always page 0, since the UI always
        # loads page 1 before paging further) - then reused as-is for every
        # other page of the same query, so a listing's badge does not flip
        # depending on which page happened to load it.
        if self._calibration is None and listings:
            self._calibration = self._compute_calibration(listings)

        return listings, total

    @staticmethod
    def _velocity(listing: Listing, now: float) -> float:
        """Views per day since creation - a proxy for "trending" since Etsy
        gives no rolling/daily view counts, only lifetime totals."""
        age_days = max(1.0, (now - listing.created_timestamp) / 86400) \
            if listing.created_timestamp else 1.0
        return listing.views / age_days

    @staticmethod
    def _conversion(listing: Listing) -> float:
        """Favorites per view - a proxy for how much an item resonates with
        the people who actually see it, independent of its raw view count."""
        return listing.num_favorers / listing.views if listing.views else 0.0

    def _composite_score(self, listing: Listing, calibration: dict) -> float:
        vel_max = calibration["vel_max"] or 1.0
        conv_max = calibration["conv_max"] or 1.0
        vel_norm = min(1.0, self._velocity(listing, calibration["now"]) / vel_max)
        conv_norm = min(1.0, self._conversion(listing) / conv_max)
        return 0.6 * vel_norm + 0.4 * conv_norm

    def _compute_calibration(self, listings: dict[str, Listing]) -> dict:
        """Turns one page's worth of raw stats into thresholds for the
        badges, calibrated to this specific search's own results (a niche
        query and a broad query have wildly different favorite/view scales,
        so a fixed global threshold would misfire on one of them).

        "Популярне": top ~15% by log(num_favorers+1) - log-scaled because
        favorites are extremely right-skewed (a few viral listings would
        otherwise blow out a linear scale).

        "Гаряче": top ~15% by a 0.6/0.4 blend of normalized velocity
        (views/day) and normalized conversion (favorites/view) - velocity
        catches items getting a lot of fresh traffic, conversion catches
        items that convert that traffic disproportionately well; blending
        the two avoids "Гаряче" being pure "highest view count"."""
        now = time.time()
        values = list(listings.values())

        pop_scores = sorted((math.log1p(l.num_favorers) for l in values), reverse=True)
        vel_max = max((self._velocity(l, now) for l in values), default=0.0) or 1.0
        conv_max = max((self._conversion(l) for l in values), default=0.0) or 1.0

        calibration = {"now": now, "vel_max": vel_max, "conv_max": conv_max}
        hot_scores = sorted(
            (self._composite_score(l, calibration) for l in values), reverse=True)

        rank = max(0, min(len(values) - 1, int(len(values) * BADGE_PERCENTILE)))
        calibration["pop_threshold"] = pop_scores[rank] if pop_scores else float("inf")
        calibration["hot_threshold"] = hot_scores[rank] if hot_scores else float("inf")
        return calibration
