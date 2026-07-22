# -*- coding: utf-8 -*-
"""
CompositeListingSource - a ListingSource that fans out to one of several
named sources, switched at runtime via set_active(). This is the
modularity seam for listing sources: every controller and the generation
queue hold one reference to a single CompositeListingSource instance (see
container.listing_source) and never know which concrete source is active.
Adding a third source later (a different marketplace, a CSV import, ...)
means writing one more ListingSource implementation and registering it in
container.py - no controller or queue code changes.
"""

from dataclasses import dataclass

from .listing_source import Listing, ListingPage, ListingSource


class UnsupportedByActiveSource(RuntimeError):
    """Raised when an operation (e.g. search()) is called that the
    currently active source does not implement."""


@dataclass
class SourceInfo:
    id: str
    label: str


class CompositeListingSource(ListingSource):
    def __init__(self, sources: dict[str, ListingSource], labels: dict[str, str],
                 default: str):
        self._sources = sources
        self._labels = labels
        self._active = default

    # ---------------- source switching ----------------

    @property
    def active_id(self) -> str:
        return self._active

    @property
    def active(self) -> ListingSource:
        return self._sources[self._active]

    def set_active(self, source_id: str) -> None:
        if source_id not in self._sources:
            raise KeyError(f"Unknown listing source: {source_id}")
        self._active = source_id

    def available(self) -> list[SourceInfo]:
        return [SourceInfo(id=sid, label=self._labels.get(sid, sid))
                for sid in self._sources]

    # ---------------- ListingSource (delegated to the active source) ----------------

    def list_pages(self) -> list[ListingPage]:
        return self.active.list_pages()

    def get_page(self, page_id: str) -> dict[str, Listing]:
        return self.active.get_page(page_id)

    def get_all(self) -> dict[str, Listing]:
        return self.active.get_all()

    def get_by_ids(self, lids: list[str]) -> dict[str, Listing]:
        return self.active.get_by_ids(lids)

    def is_popular(self, listing: Listing) -> bool:
        return self.active.is_popular(listing)

    def is_hot(self, listing: Listing) -> bool:
        return self.active.is_hot(listing)

    def add_source(self, **kwargs) -> int:
        return self.active.add_source(**kwargs)

    # ---------------- extra capability: live search ----------------
    # Not part of the base ListingSource interface - only EtsyApiListingSource
    # implements it. Delegating it here (rather than controllers reaching
    # into a specific named source) keeps controllers source-agnostic: they
    # just call listing_source.search(...) and get a clear error if the
    # currently active source doesn't support it.

    def search(self, keywords: str) -> None:
        target = self.active
        if not hasattr(target, "search"):
            raise UnsupportedByActiveSource(
                f'Активне джерело («{self._labels.get(self._active, self._active)}») '
                "не підтримує пошук - перемкнись на «Пошук на Etsy».")
        target.search(keywords)
