# -*- coding: utf-8 -*-
"""A tiny bounded LRU map, used as the ceiling on the Etsy sources' caches.

Why not functools.lru_cache: these caches aren't memoized function calls.
They are explicitly managed dictionaries whose contents are computed in
batches (one Etsy response fills 78 entries at once), inspected in bulk
(get_by_ids scans every cached page), and cleared on a new search - none of
which an @lru_cache-decorated function can express.

Why bounded at all: every one of those caches used to be an unbounded dict
kept for the life of the process. A Listing carries its own description
(2-5 KB) and full photo list, so browsing detail pages all afternoon under
one search query grew _id_cache without limit, and each distinct shop-name
query added up to 100 more Shop objects that were never released.

Deliberately NOT thread-safe on its own: every instance here lives behind
its owner's lock (EtsyApiListingSource._lock, EtsyApiShopSource._lock),
which is already held across the network call that fills it. A second lock
inside would buy nothing and only invite lock-ordering bugs.

No TTL, on purpose: "restart the app for fresh numbers" is the documented
behaviour of these caches (see EtsyApiShopSource), and this class only
bounds how much memory that costs - it doesn't change what a hit returns.
"""

from collections import OrderedDict
from typing import Iterator, MutableMapping


class LruCache(MutableMapping):
    """dict-like, capped at `maxsize` entries; the least recently used entry
    is evicted on insert.

    Exactly two operations count as a "use": `cache[key]` and `cache[key] =
    value`. Everything else - `get`, `in`, `values()`, `items()`, `keys()`,
    iteration - inspects without reordering. That distinction matters here
    rather than being a stylistic choice: MutableMapping's default mixins
    implement all of those on top of __getitem__, so a single bulk scan
    (`get_by_ids` walking every cached page, `list_pages` counting rows on
    each) would otherwise re-rank the entire cache in iteration order and
    turn eviction into something unrelated to actual usage."""

    def __init__(self, maxsize: int):
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self.maxsize = maxsize
        self._data: OrderedDict = OrderedDict()

    def __getitem__(self, key):
        value = self._data[key]  # KeyError propagates, like a dict
        self._data.move_to_end(key)
        return value

    def __setitem__(self, key, value) -> None:
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        while len(self._data) > self.maxsize:
            self._data.popitem(last=False)

    def __delitem__(self, key) -> None:
        del self._data[key]

    def __iter__(self) -> Iterator:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    # ---- inspection: never reorders (see the class docstring) ----

    def __contains__(self, key) -> bool:
        return key in self._data

    def get(self, key, default=None):
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()

    def items(self):
        return self._data.items()

    def clear(self) -> None:
        self._data.clear()

    def __repr__(self) -> str:
        return f"LruCache(maxsize={self.maxsize}, size={len(self._data)})"
