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
from dataclasses import dataclass


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
