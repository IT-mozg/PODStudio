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
                                        _HistoryEntry, _recent_months)
from models.shop_source import Shop


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


def age_entry(source, shop_id: str, days: int, review_delta: int = 0) -> None:
    """Backdate a cached entry so the same-day shortcut lets go of it.

    review_delta lowers the count the entry was taken at, which is how the
    source learns that reviews have been written since."""
    e = source._history_cache.get(shop_id)
    source._history_cache[shop_id] = _HistoryEntry(
        dict(e.counts), e.first_review, e.review_count - review_delta,
        e.total_sales, e.fetched_at - days * 86400)


def test_a_second_look_on_the_same_day_costs_no_request_at_all():
    """These are monthly numbers. Re-deriving them several times an afternoon
    buys nothing and spends a key capped at 5,000 requests a day, so an entry
    measured earlier today answers on its own - shop record included."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    first = source.sales_history("5")
    before = len(client.requests)
    again = source.sales_history("5")
    assert client.requests[before:] == [], "went to Etsy for numbers it had"
    assert [(m.month, m.sales) for m in again.months] == [(m.month, m.sales) for m in first.months]


def test_yesterdays_entry_does_refetch_the_shop_record():
    """Once the day has turned, review_count is the staleness check - and
    checking a cached number against itself proves nothing."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.sales_history("5")
    age_entry(source, "5", days=1)
    before = len(client.requests)
    source.sales_history("5")
    shop_requests = [u for u in client.requests[before:] if "/reviews?" not in u]
    assert len(shop_requests) == 1, "trusted a cached review_count"


def test_a_cached_record_with_no_reviews_does_not_stick_forever():
    """search() caches a Shop for every result, so a shop that had no reviews
    then keeps that record for the life of the process. Trusting it on the
    cold path made "this shop has no reviews" permanent: the estimate returned
    None, cached nothing, and took the same path again next time."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    stale = Shop(shop_id="5", name="Shop5", total_sales=0, review_count=0)
    source._by_id["5"] = stale
    history = source.sales_history("5")
    assert history is not None, "still stuck on the stale record"
    assert any(m.known for m in history.months)


def test_a_cached_record_that_understates_the_shop_does_not_truncate_the_walk():
    """The walk/count choice is made on review_count. A record from before the
    shop crossed REVIEW_WALK_MAX sends a huge shop down the walk, where the
    page cap leaves only its newest reviews - on a big shop that is a few
    days, so every month looks like it predates the first review and the chart
    comes back empty."""
    starts = _month_starts()
    # One review predating the window, so every month on screen is past the
    # shop's blind spot and a correct run marks all twelve known. A believed
    # capped walk sees only the newest reviews and marks almost none.
    many = [starts[0] - 86400] + [s + 60 for s in starts] * (REVIEW_WALK_MAX + 100)
    source, _ = build_history_source(many)
    source._by_id["5"] = Shop(shop_id="5", name="Shop5", total_sales=9,
                              review_count=REVIEW_WALK_MAX - 100)
    history = source.sales_history("5")
    assert all(m.known for m in history.months), "the capped walk was believed"


def test_yesterdays_entry_rereads_no_month_while_review_count_is_unchanged():
    """The shop record fetched above doubles as the staleness check: an equal
    review_count means no review has been written, so no bucket can have
    moved - not even the open one."""
    source, client = build_history_source([s + 60 for s in _month_starts()])
    source.sales_history("5")
    age_entry(source, "5", days=1)
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
    age_entry(source, "5", days=1)
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
