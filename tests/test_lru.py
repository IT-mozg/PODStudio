# -*- coding: utf-8 -*-
"""models/lru.py - the bound, and the "what counts as a use" rule.

test_bulk_inspection_does_not_reorder guards a subtlety that is easy to
reintroduce: MutableMapping implements get/values/items on top of
__getitem__, so without the explicit overrides a single scan of the cache
(EtsyApiListingSource.get_by_ids walks every cached page on every call)
would re-rank every entry in iteration order and make eviction track
scanning rather than use."""

import pytest

from models.lru import LruCache


def test_evicts_least_recently_used():
    cache = LruCache(3)
    cache["a"], cache["b"], cache["c"] = 1, 2, 3
    cache["a"]                      # touch a -> b is now the oldest
    cache["d"] = 4
    assert set(cache.keys()) == {"a", "c", "d"}


def test_write_counts_as_a_use():
    cache = LruCache(2)
    cache["a"], cache["b"] = 1, 2
    cache["a"] = 10                 # rewriting a refreshes it
    cache["c"] = 3
    assert set(cache.keys()) == {"a", "c"}
    assert cache["a"] == 10


def test_never_exceeds_maxsize():
    cache = LruCache(5)
    for i in range(500):
        cache[i] = i
    assert len(cache) == 5
    assert set(cache.keys()) == {495, 496, 497, 498, 499}


def test_bulk_inspection_does_not_reorder():
    cache = LruCache(3)
    cache["a"], cache["b"], cache["c"] = 1, 2, 3   # "a" is the oldest

    # None of these may count as a use of "a" - if any did, "a" would be
    # promoted to most-recent and "b" would be evicted below instead.
    assert cache.get("a") == 1
    assert "a" in cache
    list(cache.values())
    list(cache.items())
    list(cache.keys())
    list(cache)

    cache["d"] = 4
    assert "a" not in cache, "inspecting 'a' must not have saved it from eviction"
    assert set(cache.keys()) == {"b", "c", "d"}


def test_missing_key_raises_like_a_dict():
    cache = LruCache(2)
    with pytest.raises(KeyError):
        cache["nope"]
    assert cache.get("nope") is None
    assert cache.get("nope", "default") == "default"


def test_delete_and_clear():
    cache = LruCache(3)
    cache["a"], cache["b"] = 1, 2
    del cache["a"]
    assert "a" not in cache
    cache.clear()
    assert len(cache) == 0


def test_rejects_a_useless_maxsize():
    with pytest.raises(ValueError):
        LruCache(0)
