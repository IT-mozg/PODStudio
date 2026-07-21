# -*- coding: utf-8 -*-
"""
Abstraction over the source of Etsy listings.

Today the only implementation (HtmlPageListingSource) parses html pages
that the user manually saved into pages/ (search, shop, favorites -
anything).

If an official Etsy API ever becomes available (or any other source), it
is enough to write a new class implementing the ListingSource interface
and swap its instance in container.py in place of HtmlPageListingSource -
the rest of the code (Flask controllers, generation queue, history) works
only through this interface and does not need to know where listings
actually come from.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Listing:
    """A single Etsy item - regardless of where it came from."""
    lid: str
    title: str
    local_img: str = ""
    remote_img: str = ""


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

    def add_source(self, **kwargs) -> int:
        """Add a new page to the source (e.g. an uploaded file).

        Not every source supports adding pages (an official API is always
        "current" by itself), so the default is NotImplementedError."""
        raise NotImplementedError(
            f"{type(self).__name__} does not support adding new pages")


class HtmlPageListingSource(ListingSource):
    """Parses all .html/.htm files in pages_dir. Cached by file mtime, so
    unchanged pages are not re-parsed on every request."""

    def __init__(self, pages_dir: Path, parser):
        """parser: callable(Path) -> dict[lid, {"title","local_img","remote_img"}]
        (signature-compatible with generate_designs.parse_page)."""
        self.pages_dir = pages_dir
        self._parser = parser
        self._cache: dict[str, tuple[float, dict[str, Listing]]] = {}

    def _files(self) -> list[Path]:
        files = list(self.pages_dir.glob("*.html")) + list(self.pages_dir.glob("*.htm"))
        return sorted(files, key=lambda f: f.stat().st_mtime)

    def _parse_cached(self, f: Path) -> dict[str, Listing]:
        mtime = f.stat().st_mtime
        cached = self._cache.get(str(f))
        if cached and cached[0] == mtime:
            return cached[1]
        raw = self._parser(f)
        found = {lid: Listing(lid=lid, title=data.get("title", ""),
                              local_img=data.get("local_img", ""),
                              remote_img=data.get("remote_img", ""))
                 for lid, data in raw.items()}
        self._cache[str(f)] = (mtime, found)
        return found

    def list_pages(self) -> list[ListingPage]:
        return [ListingPage(id=f.name, label=f.stem, count=len(self._parse_cached(f)))
                for f in self._files()]

    def get_page(self, page_id: str) -> dict[str, Listing]:
        for f in self._files():
            if f.name == page_id:
                return self._parse_cached(f)
        return {}

    def get_all(self) -> dict[str, Listing]:
        merged: dict[str, Listing] = {}
        for f in self._files():
            for lid, listing in self._parse_cached(f).items():
                merged.setdefault(lid, listing)
        return merged

    def add_source(self, *, file_storage, filename: str) -> int:
        """file_storage: a werkzeug FileStorage (from request.files)."""
        name = Path(filename or "").name
        if not name.lower().endswith((".html", ".htm")):
            return 0
        file_storage.save(self.pages_dir / name)
        return 1
