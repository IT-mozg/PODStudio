# -*- coding: utf-8 -*-
"""
Abstraction over the source of Etsy listings.

The only implementation today is EtsyApiListingSource (models/
etsy_api_listing_source.py), backed by the official Etsy Open API v3. Any
other source (a different marketplace, a CSV import, ...) just needs to
implement the ListingSource interface and be swapped in in container.py -
the rest of the code (Flask controllers, generation queue, history) works
only through this interface and does not need to know where listings
actually come from.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Listing:
    """A single Etsy item - regardless of where it came from.

    num_favorers/views/created_timestamp power the "Популярне"/"Гаряче"
    badges - see is_popular/is_hot below."""
    lid: str
    title: str
    local_img: str = ""
    remote_img: str = ""
    num_favorers: int = 0
    views: int = 0
    created_timestamp: int = 0  # unix seconds, original creation date
    shop_id: str = ""
    shop_name: str = ""
    tags: list[str] = field(default_factory=list)


@dataclass
class ListingPage:
    """One "page" of the source - an html file today, maybe an official
    API pagination parameter tomorrow. The UI shows a list of such pages
    and pages through them without knowing implementation details."""
    id: str
    label: str
    count: int


class ListingSource(ABC):
    """A port (in the hexagonal-architecture sense) for accessing listings."""

    @abstractmethod
    def list_pages(self) -> list[ListingPage]:
        """All available pages of the source, in the order shown to the user."""

    @abstractmethod
    def get_page(self, page_id: str) -> dict[str, Listing]:
        """Listings of a single page by its id: {lid: Listing}."""

    @abstractmethod
    def get_all(self) -> dict[str, Listing]:
        """All listings from all pages, merged (first occurrence wins)."""

    def get_by_ids(self, lids: list[str]) -> dict[str, Listing]:
        """Listings for specific ids, regardless of which page they're on.

        Default implementation just filters get_all() - fine for a source
        with a handful of cheap-to-enumerate pages. Override this when a
        source can fetch specific ids more cheaply (e.g. one batch API
        call) without walking every page."""
        wanted = set(lids)
        return {lid: listing for lid, listing in self.get_all().items() if lid in wanted}

    def is_popular(self, listing: Listing) -> bool:
        """Whether this listing deserves a "Популярне" badge. Default: no
        engagement data available, so always False - override where the
        source actually has real stats (see EtsyApiListingSource)."""
        return False

    def is_hot(self, listing: Listing) -> bool:
        """Whether this listing deserves a "Гаряче" (trending) badge.
        Same idea as is_popular - default False."""
        return False

    def add_source(self, **kwargs) -> int:
        """Add a new page to the source (e.g. an uploaded file).

        Not every source supports adding pages (an official API is always
        "current" by itself), so the default is NotImplementedError."""
        raise NotImplementedError(
            f"{type(self).__name__} does not support adding new pages")
