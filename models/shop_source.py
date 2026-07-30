# -*- coding: utf-8 -*-
"""
Abstraction over the source of Etsy *shops* - the competitor-research
counterpart to listing_source.py.

A separate port rather than extra methods on ListingSource: a shop and a
listing are different entities with different lifetimes (a shop record is
worth caching for a long time, a page of search results is not), and
container.py should be able to swap one without touching the other.

The only implementation today is EtsyApiShopSource
(models/etsy_api_shop_source.py).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class MonthlySales:
    """One month of a shop's estimated sales.

    `known` is the whole point of this dataclass. A month with no reviews is
    ambiguous: it is either a genuinely quiet month, or a month before the
    shop's first review ever landed, when sales are simply invisible to this
    method. Rendering the second case as 0 is the single largest error this
    estimate makes - measured on a real shop, two months of confirmed selling
    came out as zero (etsy_shop_sales_history_research.md, "Ground truth
    check"). `known=False` means "no data", and must never render as 0."""

    month: str   # "2026-03" - calendar month in UTC
    sales: int
    known: bool


@dataclass
class SalesHistory:
    """A shop's estimated monthly sales, newest month last.

    An *estimate*, not measured data: Etsy publishes one lifetime counter and
    nothing per month, so the shape comes from the review histogram and the
    magnitude from `ratio`. Consumers must label it as an estimate."""

    shop_id: str
    months: list[MonthlySales] = field(default_factory=list)
    ratio: float = 0.0  # transaction_sold_count / review_count - sales per
                        # review, self-calibrating per shop (measured range
                        # across four real shops: 6.60 to 12.19)


@dataclass
class Shop:
    """A single Etsy shop, as far as the public API exposes one.

    Every field here is real data from Etsy. Notably *absent*, because Etsy
    exposes them nowhere: revenue (issue #80), growth over time (needs daily
    snapshots of total_sales - issue #81) and any notion of a "niche"
    (issue #82). Those stay out of this dataclass rather than being carried
    as permanently-None fields."""

    shop_id: str
    name: str
    total_sales: int = 0        # transaction_sold_count - lifetime, counts
                               # order line items rather than orders (see
                               # etsy_shop_sales_history_research.md)
    review_count: int = 0
    review_average: float = 0.0
    listing_count: int = 0      # listing_active_count
    created_timestamp: int = 0  # unix seconds, shop creation date
    num_favorers: int = 0
    icon_url: str = ""
    url: str = ""


class ShopSource(ABC):
    """A port (in the hexagonal-architecture sense) for accessing shops."""

    @abstractmethod
    def search(self, name: str) -> tuple[list[Shop], int]:
        """Shops matching a name, plus how many matches the source reports
        in total (which can be far more than the returned rows).

        Name-only on purpose: Etsy has no way to enumerate or rank shops by
        anything else - see EtsyApiShopSource."""

    @abstractmethod
    def get_by_id(self, shop_id: str) -> Shop | None:
        """A single shop, or None if the source has no such shop."""

    def sales_history(self, shop_id: str) -> SalesHistory | None:
        """Estimated monthly sales for a shop, or None if this source can't
        estimate them (no such shop, or no reviews to derive them from).

        Not abstract: a source that has no way to reconstruct history should
        leave the block empty rather than force every implementation to carry
        a stub. Returning None is a valid answer, never an error."""
        return None

    def get_by_ids(self, shop_ids: list[str]) -> dict[str, Shop]:
        """Several shops at once: {shop_id: Shop}, missing ids simply absent.

        Default implementation loops over get_by_id - correct for any
        source. Override where a source can fetch a batch in one request;
        the Etsy API cannot (there is no shop batch endpoint), which is why
        the loop lives here rather than being pushed into the caller."""
        found: dict[str, Shop] = {}
        for shop_id in dict.fromkeys(shop_ids):  # dedupe, keep order
            shop = self.get_by_id(shop_id)
            if shop:
                found[shop_id] = shop
        return found
