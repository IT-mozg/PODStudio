# -*- coding: utf-8 -*-
"""models/etsy_api_shop_source.py - caching behaviour, no network.

EtsyApiShopSource takes its transport as a constructor dependency, so a fake
client that counts requests and never leaves the process is enough to drive
it. Two things are under test:

  * the caches are bounded now (they were unbounded dicts nothing cleared)
    without changing what a hit returns;
  * get_by_ids() no longer drops the lock between checking the cache and
    fetching, which used to let two threads request the same shop at once -
    against a key capped at 5 requests/second;
  * sales_history() stays inside its request budget. That budget is the whole
    design (a 130k-review shop must cost 13 requests, not 1,306) and it is
    invisible in a single-threaded read of the code - the only symptom of
    losing it is a quota that quietly drains.
"""

import threading
import urllib.parse

import pytest

from models.etsy_api_shop_source import (HISTORY_MONTHS, REVIEW_WALK_MAX,
                                        REVIEWS_PAGE_LIMIT, SEARCH_CACHE_SIZE,
                                        SHOP_CACHE_SIZE, EtsyApiShopSource,
                                        _recent_months)


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


class FakeReviewsClient:
    """Serves /shops/<id> and /shops/<id>/reviews from a list of timestamps.

    Separate from FakeClient because the reviews endpoint is what the request
    budget is spent on, and the tests below need to tell a paged walk
    (limit=100) apart from a date-range count (limit=1)."""

    def __init__(self, review_times: list[int], sold: int = 1000):
        self.reviews = sorted(review_times, reverse=True)  # newest first, as Etsy sends them
        self.sold = sold
        self.requests: list[str] = []

    @property
    def review_requests(self) -> list[dict]:
        return [dict(urllib.parse.parse_qsl(u.split("?", 1)[1]))
                for u in self.requests if "/reviews?" in u]

    def get(self, url: str) -> dict:
        self.requests.append(url)
        if "/reviews?" not in url:
            shop_id = url.rsplit("/", 1)[-1]
            return {"shop_id": int(shop_id), "shop_name": f"Shop{shop_id}",
                    "transaction_sold_count": self.sold,
                    "review_count": len(self.reviews)}
        q = dict(urllib.parse.parse_qsl(url.split("?", 1)[1]))
        rows = self.reviews
        if "min_created" in q:
            rows = [t for t in rows if t >= int(q["min_created"])]
        if "max_created" in q:
            rows = [t for t in rows if t <= int(q["max_created"])]
        offset = int(q.get("offset", 0))
        limit = int(q.get("limit", REVIEWS_PAGE_LIMIT))
        page = rows[offset:offset + limit]
        return {"count": len(rows),
                "results": [{"created_timestamp": t, "transaction_id": t} for t in page]}


def build_history_source(review_times: list[int], sold: int = 1000):
    source = EtsyApiShopSource(api_key_provider=lambda: "key",
                               shared_secret_provider=lambda: "secret")
    client = FakeReviewsClient(review_times, sold)
    source._client = client
    return source, client


def _month_starts() -> list[int]:
    return [start for start, _, _ in _recent_months(HISTORY_MONTHS)]


def test_a_small_shop_reads_its_reviews_in_one_page():
    """Below REVIEW_WALK_MAX the counting mode would cost 13 requests for the
    same answer, so the walk has to win."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.sales_history("5")
    assert len(client.review_requests) == 1
    assert client.review_requests[0]["limit"] == str(REVIEWS_PAGE_LIMIT)


def test_a_huge_shop_never_walks_its_reviews():
    """The point of the counting mode: 130k reviews must not become 1,306
    paged requests. Nothing may ask for a page of rows at all."""
    many = [s + 60 for s in _month_starts()] * (REVIEW_WALK_MAX + 100)
    source, client = build_history_source(many)
    source.sales_history("5")
    asked = client.review_requests
    assert len(asked) == 1 + HISTORY_MONTHS, f"{len(asked)} requests"
    assert all(q["limit"] == "1" for q in asked), "a row page slipped in"


def test_a_cold_estimate_reuses_the_shop_record_the_page_just_fetched():
    """Opening a shop calls /shops/<id> and then /shops/<id>/sales-history.
    Evicting the record in between billed the same shop twice for one page
    open; with nothing cached there is no review_count to compare against, so
    the fresh-by-definition record is fine."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.get_by_id("5")            # what the detail page does first
    before = len(client.requests)
    source.sales_history("5")
    shop_requests = [u for u in client.requests[before:] if "/reviews?" not in u]
    assert shop_requests == [], "re-fetched a record it already had"


def test_a_warm_estimate_does_refetch_the_shop_record():
    """The mirror image: once counts exist, review_count is the staleness
    check, and a cached record would pin it to whatever it was first time."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.sales_history("5")
    before = len(client.requests)
    source.sales_history("5")
    shop_requests = [u for u in client.requests[before:] if "/reviews?" not in u]
    assert len(shop_requests) == 1, "trusted a cached review_count"


def test_a_revisit_costs_nothing_while_the_review_count_is_unchanged():
    """The shop record is re-read on every call anyway, so its review_count is
    a free staleness check: equal means no review has been written, which
    means no bucket can have moved."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.sales_history("5")
    before = len(client.review_requests)
    source.sales_history("5")
    assert len(client.review_requests) == before, "re-read months that cannot have changed"


def test_a_revisit_rereads_only_the_open_month():
    """The cached counts are review counts, not sales, precisely so a revisit
    can be cheap *and* current. Caching the finished numbers instead froze
    every bar until the process restarted."""
    starts = _month_starts()
    source, client = build_history_source([s + 60 for s in starts])
    first = source.sales_history("5")
    before = len(client.review_requests)

    client.reviews = sorted(client.reviews + [starts[-1] + 120], reverse=True)
    second = source.sales_history("5")

    refetched = client.review_requests[before:]
    assert len(refetched) == 1, "refetched more than the open month"
    assert refetched[0]["min_created"] == str(starts[-1]), "re-read a month that had ended"
    # Sales, unlike counts, are expected to move everywhere: ratio is
    # sold/review_count, so one new review reprices all twelve bars. That is
    # the reason counts are what gets cached.
    assert second.months[-1].known and first.months[-1].known
    assert [m.month for m in second.months] == [m.month for m in first.months]


def test_months_before_the_first_review_are_unknown_not_zero():
    """The estimate cannot see sales made before a shop's first review. On a
    real shop, rendering those months as 0 erased two months of confirmed
    selling - so they have to come back as unknown."""
    starts = _month_starts()
    source, _ = build_history_source([starts[-2] + 60, starts[-1] + 60])
    history = source.sales_history("5")
    assert [m.known for m in history.months[:-2]] == [False] * (HISTORY_MONTHS - 2)
    assert history.months[-1].known, "the month after the first review is visible"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
