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

To enable this source instead of the manual page import, in container.py
replace:

    listing_source = HtmlPageListingSource(engine.PAGES_DIR, parser=engine.parse_page)

with:

    listing_source = EtsyApiListingSource(
        api_key=..., shared_secret=..., keywords="funny cat shirt")

The rest of the code (controllers, generation, history) does not know and
should not need to know that the source changed - that is the whole point
of the ListingSource interface.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

from . import generate_designs as _gd
from .listing_source import Listing, ListingPage, ListingSource

API_BASE = "https://openapi.etsy.com/v3/application"
TIMEOUT = 15


class EtsyApiError(RuntimeError):
    """The Etsy API returned an error (bad key, rate limit, etc.)."""


class EtsyApiListingSource(ListingSource):
    """Listing source backed by the official Etsy API.

    A "page" here is a page of search results for a given query
    (offset-based pagination on Etsy's side), not a file like in
    HtmlPageListingSource - but the external interface is the same, so
    the UI and the rest of the app do not need to know the difference."""

    def __init__(self, api_key: str, shared_secret: str, keywords: str, page_size: int = 25):
        if not api_key or not shared_secret:
            raise ValueError("Both the Etsy API keystring and shared secret are required")
        self._auth_header = f"{api_key}:{shared_secret}"
        self.keywords = keywords
        self.page_size = page_size
        self._page_cache: dict[int, dict[str, Listing]] = {}
        self._total_count: int | None = None

    # ---------------- ListingSource ----------------

    def list_pages(self) -> list[ListingPage]:
        if self._total_count is None:
            self._page_cache[0], self._total_count = self._fetch(offset=0)
        n_pages = max(1, -(-self._total_count // self.page_size))  # ceil
        return [
            ListingPage(id=str(i),
                        label=f'"{self.keywords}" - page {i + 1}',
                        count=len(self._page_cache.get(i, ())) or self.page_size)
            for i in range(n_pages)
        ]

    def get_page(self, page_id: str) -> dict[str, Listing]:
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

    # add_source is intentionally not overridden - "uploading a file" makes
    # no sense for an API-backed source, the base ListingSource.add_source()
    # already raises NotImplementedError.

    # ---------------- internal ----------------

    def _get(self, url: str) -> dict:
        req = urllib.request.Request(url, headers={"x-api-key": self._auth_header})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=_gd.SSL_CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise EtsyApiError(f"Etsy API {e.code}: {body[:300]}") from e
        except urllib.error.URLError as e:
            raise EtsyApiError(f"Could not reach the Etsy API: {e}") from e

    def _fetch(self, offset: int) -> tuple[dict[str, Listing], int]:
        search_params = urllib.parse.urlencode({
            "keywords": self.keywords,
            "limit": self.page_size,
            "offset": offset,
        })
        search_data = self._get(f"{API_BASE}/listings/active?{search_params}")
        total = search_data.get("count", 0)
        ids = [str(r["listing_id"]) for r in search_data.get("results", [])
               if r.get("listing_id")]
        if not ids:
            return {}, total

        # step 2: one batch call to get titles + images for exactly these ids,
        # keeping the ranked order from the search step
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
                title=row.get("title", ""),
                remote_img=remote_img,
            )
        return listings, total
