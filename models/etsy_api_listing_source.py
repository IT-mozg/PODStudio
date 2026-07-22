# -*- coding: utf-8 -*-
"""
ListingSource implementation backed by the official Etsy Open API v3
(https://developers.etsy.com/documentation/reference/) - no HTML parsing
or browser automation, only documented REST requests with an official
developer key.

STATUS: verified against a real "Personal Access" key. Two things the docs
don't make obvious, found by testing directly:

  1. The x-api-key header must be "{keystring}:{shared_secret}", not just
     the keystring alone - a bare keystring gets a 403
     ("Shared secret is required in x-api-key header").
  2. GET /listings/active (search) never embeds images, no matter what
     `includes` value is passed. Images only come back from the *batch*
     endpoint (GET /listings/batch?listing_ids=...&includes=Images), so
     fetching a page of results is a two-step call: search for matching
     listing_ids (in ranked order), then batch-fetch those specific ids
     with images. This also keeps the request count down - one batch call
     for a whole page instead of one image call per listing (relevant
     given the 5 QPS / 5,000 requests-per-day personal-access limit).
  3. Titles come back with literal HTML entities baked in (e.g. "DM&#39;s
     Plans" instead of "DM's Plans"), so they need html.unescape() before
     display - Etsy's API does not do this for you.
  4. Without an explicit sort_on, results are NOT ranked by relevance -
     confirmed live: unsorted results mixed in barely-related items (even
     digital SVG/PNG downloads for a plain "funny cat shirt" search).
     sort_on=score is what actually orders by match quality, and it is
     always sent now. There is no favorites/popularity sort or filter at
     all (min_favorites and is_best_seller/explicit - the query params the
     Etsy *website* uses - are silently ignored by this API); min_price/
     max_price (in whole dollars) do work, confirmed live.

Credentials are passed as callables (api_key_provider/shared_secret_provider),
not plain strings, so they can be read fresh from settings on every request -
the same pattern OpenAIDesignGenerator uses for the OpenAI key. That way
saving new Etsy credentials in Settings takes effect immediately, no restart.

"Популярне"/"Гаряче" badges (is_popular/is_hot): Etsy's API exposes no
bestseller/popularity signal at all (confirmed live - no such field, no
such sort, no such filter). What it does give per listing is num_favorers,
views (both lifetime totals, not "today") and the creation date. See
_compute_calibration() below for exactly how those are turned into badges.
"""

import html
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable

from . import generate_designs as _gd
from .listing_source import Listing, ListingPage, ListingSource

API_BASE = "https://openapi.etsy.com/v3/application"
TIMEOUT = 15
MAX_PAGES = 40  # a sane browsing depth cap - nobody needs to page to result #35,000
BADGE_PERCENTILE = 0.15  # top ~15% of the calibration sample earns a badge


class EtsyApiError(RuntimeError):
    """The Etsy API returned an error (bad key, rate limit, etc.)."""


class EtsyApiListingSource(ListingSource):
    """Listing source backed by the official Etsy API.

    A "page" here is a page of search results for the *current* query
    (offset-based pagination on Etsy's side), not a file like in
    HtmlPageListingSource - but the external interface is the same, so the
    UI and the rest of the app do not need to know the difference. The
    query itself is set at runtime via search(), not fixed at construction,
    so a search bar can point this same instance at a new keyword any time."""

    def __init__(self, api_key_provider: Callable[[], str],
                 shared_secret_provider: Callable[[], str],
                 keywords: str = "", page_size: int = 78):
        self._api_key_provider = api_key_provider
        self._shared_secret_provider = shared_secret_provider
        self.page_size = page_size
        self.keywords = ""
        self._has_searched = False
        self._page_cache: dict[int, dict[str, Listing]] = {}
        self._total_count: int | None = None
        self._calibration: dict | None = None
        if keywords:
            self.search(keywords)

    # ---------------- search control ----------------

    def search(self, keywords: str) -> None:
        """Point this source at a new query - invalidates cached pages."""
        self.keywords = keywords.strip()
        self._has_searched = bool(self.keywords)
        self._page_cache = {}
        self._total_count = None
        self._calibration = None

    # ---------------- ListingSource ----------------

    def list_pages(self) -> list[ListingPage]:
        if not self._has_searched:
            return []
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
        """One batch API call for exactly these ids - does not walk pages.
        Etsy's batch endpoint caps out around 100 ids per call, so large
        requests are chunked."""
        ids = [str(x) for x in dict.fromkeys(lids) if x]  # dedupe, keep order
        listings: dict[str, Listing] = {}
        for i in range(0, len(ids), 100):
            listings.update(self._batch_fetch(ids[i:i + 100]))
        return listings

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

    def _get(self, url: str) -> dict:
        api_key = self._api_key_provider()
        shared_secret = self._shared_secret_provider()
        if not api_key or not shared_secret:
            raise EtsyApiError(
                "Немає Etsy API-ключа/shared secret. Додай їх у налаштуваннях "
                "(іконка шестерні вгорі).")
        auth_header = f"{api_key}:{shared_secret}"
        req = urllib.request.Request(url, headers={"x-api-key": auth_header})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=_gd.SSL_CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise EtsyApiError(f"Etsy API {e.code}: {body[:300]}") from e
        except urllib.error.URLError as e:
            raise EtsyApiError(f"Could not reach the Etsy API: {e}") from e

    def _batch_fetch(self, ids: list[str]) -> dict[str, Listing]:
        """A single call to the batch endpoint (max ~100 ids), with images."""
        if not ids:
            return {}
        batch_params = urllib.parse.urlencode({
            "listing_ids": ",".join(ids),
            "includes": "Images",
        })
        batch_data = self._get(f"{API_BASE}/listings/batch?{batch_params}")
        by_id = {str(r["listing_id"]): r for r in batch_data.get("results", [])}

        listings: dict[str, Listing] = {}
        for lid in ids:
            row = by_id.get(lid)
            if not row:
                continue
            images = row.get("images") or []
            remote_img = images[0].get("url_570xN", "") if images else ""
            listings[lid] = Listing(
                lid=lid,
                title=html.unescape(row.get("title", "")),
                remote_img=remote_img,
                num_favorers=row.get("num_favorers") or 0,
                views=row.get("views") or 0,
                created_timestamp=row.get("original_creation_timestamp") or 0,
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
        search_data = self._get(f"{API_BASE}/listings/active?{search_params}")
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
