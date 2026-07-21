# -*- coding: utf-8 -*-
"""
ListingSource implementation backed by the official Etsy Open API v3
(https://developers.etsy.com/documentation/reference/) - no HTML parsing
or browser automation, only documented REST requests with an official
developer key.

STATUS: not yet verified against a real key (the API application has just
been submitted). The response field mapping was written from the official
docs, but once a key arrives it is worth running a smoke test
(list_pages()/get_page() for a couple of queries) and fixing the mapping
if the actual response shape differs.

To enable this source instead of the manual page import, in container.py
replace:

    listing_source = HtmlPageListingSource(engine.PAGES_DIR, parser=engine.parse_page)

with:

    listing_source = EtsyApiListingSource(api_key=..., keywords="funny cat shirt")

The rest of the code (controllers, generation, history) does not know and
should not need to know that the source changed - that is the whole point
of the ListingSource interface.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

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

    def __init__(self, api_key: str, keywords: str, page_size: int = 25):
        if not api_key:
            raise ValueError("An Etsy Open API key (x-api-key) is required")
        self.api_key = api_key
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

    def _fetch(self, offset: int) -> tuple[dict[str, Listing], int]:
        params = urllib.parse.urlencode({
            "keywords": self.keywords,
            "limit": self.page_size,
            "offset": offset,
        })
        url = f"{API_BASE}/listings/active?{params}"
        req = urllib.request.Request(url, headers={"x-api-key": self.api_key})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise EtsyApiError(f"Etsy API {e.code}: {body[:300]}") from e
        except urllib.error.URLError as e:
            raise EtsyApiError(f"Could not reach the Etsy API: {e}") from e

        total = data.get("count", 0)
        listings: dict[str, Listing] = {}
        for row in data.get("results", []):
            lid = str(row.get("listing_id", ""))
            if not lid:
                continue
            images = row.get("images") or []
            remote_img = images[0].get("url_570xN", "") if images else ""
            listings[lid] = Listing(
                lid=lid,
                title=row.get("title", ""),
                remote_img=remote_img,
            )
        return listings, total
