# -*- coding: utf-8 -*-
"""models/etsy_api_shop_source.py - caching behaviour, no network.

EtsyApiShopSource takes its transport as a constructor dependency, so a fake
client that counts requests and never leaves the process is enough to drive
it. Two things are under test:

  * the caches are bounded now (they were unbounded dicts nothing cleared)
    without changing what a hit returns;
  * get_by_ids() no longer drops the lock between checking the cache and
    fetching, which used to let two threads request the same shop at once -
    against a key capped at 5 requests/second.
"""

import threading

import pytest

from models.etsy_api_shop_source import (SEARCH_CACHE_SIZE, SHOP_CACHE_SIZE,
                                        EtsyApiShopSource)


class FakeClient:
    """Counts requests and can be made slow, so a race has room to happen."""

    def __init__(self, delay: float = 0.0):
        self.requests: list[str] = []
        self.delay = delay
        self._lock = threading.Lock()

    def get(self, url: str) -> dict:
        with self._lock:
            self.requests.append(url)
        if self.delay:
            threading.Event().wait(self.delay)
        if "/shops/" in url:
            shop_id = url.rsplit("/", 1)[-1]
            return {"shop_id": int(shop_id), "shop_name": f"Shop{shop_id}",
                    "transaction_sold_count": 10}
        # a name search
        return {"count": 2, "results": [
            {"shop_id": 1, "shop_name": "OldRetro", "transaction_sold_count": 500},
            {"shop_id": 2, "shop_name": "OldRetroTees", "transaction_sold_count": 900},
        ]}


def build_source(delay: float = 0.0):
    source = EtsyApiShopSource(api_key_provider=lambda: "key",
                               shared_secret_provider=lambda: "secret")
    client = FakeClient(delay)
    source._client = client
    return source, client


def test_search_is_cached_and_ranked():
    source, client = build_source()
    shops, total = source.search("OldRetro")
    assert [s.name for s in shops] == ["OldRetro", "OldRetroTees"], "exact match first"
    assert total == 2

    again, _ = source.search("oldretro")  # case-insensitive cache key
    assert [s.name for s in again] == ["OldRetro", "OldRetroTees"]
    assert len(client.requests) == 1, "the second search must not hit the network"


def test_empty_query_never_costs_a_request():
    source, client = build_source()
    assert source.search("   ") == ([], 0)
    assert client.requests == []


def test_search_cache_is_bounded():
    source, client = build_source()
    for i in range(SEARCH_CACHE_SIZE + 20):
        source.search(f"query{i}")
    assert len(source._search_cache) == SEARCH_CACHE_SIZE
    # The oldest query is gone, so asking again costs a fresh request.
    before = len(client.requests)
    source.search("query0")
    assert len(client.requests) == before + 1


def test_shop_cache_is_bounded():
    source, _ = build_source()
    for i in range(1, SHOP_CACHE_SIZE + 21):
        source.get_by_id(str(i))
    assert len(source._by_id) == SHOP_CACHE_SIZE


def test_get_by_id_caches():
    source, client = build_source()
    first = source.get_by_id("7")
    second = source.get_by_id("7")
    assert first is second
    assert len(client.requests) == 1


def test_get_by_ids_respects_the_lookup_budget():
    from models.etsy_api_shop_source import MAX_LOOKUPS_PER_CALL
    source, client = build_source()
    # From 1: shop_id 0 doesn't exist on Etsy and get_by_id treats a falsy
    # shop_id in the response as "no such shop", so it would skew the count.
    ids = [str(i) for i in range(1, MAX_LOOKUPS_PER_CALL + 11)]
    found = source.get_by_ids(ids)
    assert len(found) == MAX_LOOKUPS_PER_CALL
    assert len(client.requests) == MAX_LOOKUPS_PER_CALL


def test_concurrent_lookups_of_the_same_shop_cost_one_request():
    """The lock has to cover the cache check *and* the fetch. Dropping it in
    between let every thread miss and fire its own duplicate request."""
    source, client = build_source(delay=0.05)
    start = threading.Barrier(8)
    results = []

    def lookup():
        start.wait()
        results.append(source.get_by_ids(["99"]))

    threads = [threading.Thread(target=lookup) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert len(client.requests) == 1, f"{len(client.requests)} duplicate requests"
    assert all(r["99"].name == "Shop99" for r in results)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
