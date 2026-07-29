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

    # ---- detail-only fields ----
    # Everything below is for the single-listing detail view, not the grid.
    # They cost nothing extra to populate: Etsy's /listings/batch call
    # EtsyApiListingSource already makes returns all of them in the same
    # response (verified against the live API - see that module's docstring).
    # container.listings_payload() deliberately does NOT emit them, since a
    # search page carries 78 rows and a description alone runs 2-5 KB;
    # container.listing_detail_payload() does. A source that has no such data
    # simply leaves the defaults, and the UI renders "—".
    description: str = ""
    # Etsy returns money as amount/divisor/currency_code (2499 / 100 / "USD"),
    # never a float. Kept in that raw form rather than pre-divided: the
    # currency matters (listings exist in EUR/GBP/PLN too), so nothing
    # downstream may assume "$".
    price_amount: int | None = None
    price_divisor: int = 100
    price_currency: str = ""
    images: list[str] = field(default_factory=list)  # url_570xN, in Etsy's own rank order
    url: str = ""  # canonical listing URL as Etsy reports it
    taxonomy_id: int = 0  # numeric - resolve to a name via models/etsy_taxonomy.py
    who_made: str = ""
    when_made: str = ""
    materials: list[str] = field(default_factory=list)
    style: list[str] = field(default_factory=list)
    processing_min: int | None = None
    processing_max: int | None = None
    is_personalizable: bool = False
    has_variations: bool = False
    # Print shops / manufacturers the seller declared for this listing:
    # [{"name": "A print shop in New York", "location": "Farmingdale, NY"}].
    # Etsy requires declaring them, so a non-empty list means the item is
    # produced by someone other than the seller - which for a POD research
    # tool is the single most telling field on the whole listing. An empty
    # list is NOT proof the seller prints in-house, only that none was
    # declared; who_made is the field that speaks to that.
    production_partners: list[dict] = field(default_factory=list)


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

    def find_similar(self, keywords: str, limit: int = 10,
                     exclude: str = "") -> dict[str, Listing]:
        """Listings matching a one-off query, without disturbing whatever
        this source is currently pointed at (#86).

        Default: an empty result, i.e. "this source can't answer that" - a
        source with no free-text query of its own has nothing honest to
        return here, and the UI renders the empty case explicitly rather
        than filling it in. Override where a query is actually possible
        (see EtsyApiListingSource)."""
        return {}

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
