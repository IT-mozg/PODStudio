# -*- coding: utf-8 -*-
"""controllers/shops_controller.py - the HTTP contract, no network (#117).

Companion to test_listings_controller.py, same reasoning: everything here is
asserted through HTTP, so #120/#124/#125 may move payload building and route
logic anywhere in Python and these tests still hold - unless the move changes
what design/ actually receives.

Two things specific to the shops side:

  * routing order. /api/shops/tracked and /api/shops/<id> share a prefix, and
    only the <int:> converter keeps "tracked" from being parsed as a shop id.
    That is one character in a decorator, it is trivially lost in a move, and
    the symptom is an empty bookmarks page rather than an error.
  * 404 vs 502. /shops/<id> and /sales-history both answer 404 for "no data",
    which is not an error condition - a shop with no reviews simply has no
    chart. Only an EtsyApiError is a 502. Collapsing the two would make a
    quiet shop look like an outage.
"""

import flask
import pytest

import container
from controllers.shops_controller import shops_bp
from models.etsy_api_client import EtsyApiError
from models.shop_source import MonthlySales, SalesHistory, Shop, ShopSource
from models.tracked_store import TrackedStore

# ---------------------------------------------------------------------------
# The Python -> TypeScript contract.
#
# Source of truth: container.shops_payload(), consumed verbatim by
# design/src/pages/shops/shopMapper.ts. revenue/growth/niche are listed on
# purpose: they are permanently None with a ticket each (#80/#81/#82), and
# dropping the keys would let the mapper read `undefined` instead of the
# explicit null that renders as "—".
# ---------------------------------------------------------------------------

API_SHOP_KEYS = {
    "shop_id", "name", "listing_count", "age_months", "sales",
    "review_average", "review_count", "num_favorers", "icon_url", "etsy_url",
    "revenue", "growth", "niche", "tracked",
}

# The full payload, which is wider than what the mapper consumes today:
# mapApiSalesHistory() reads only `ratio` and `months`, while `shop_id` and
# `method` are declared in its ApiSalesHistory interface and left unread.
# Pinned anyway - `method` is the field that will tell the review-histogram
# estimate apart from the daily-snapshot one (#46), and a payload refactor
# dropping it before its consumer exists is silent in both languages.
API_SALES_HISTORY_KEYS = {"shop_id", "method", "ratio", "months"}
API_MONTH_KEYS = {"month", "sales", "known"}


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeShopSource(ShopSource):
    """Answers from a dict instead of Etsy, or raises on every call."""

    def __init__(self, shops=None, history=None, error: Exception = None):
        self.shops = dict(shops or {})
        self.history = dict(history or {})
        self.error = error
        self.searched: list[str] = []
        self.looked_up: list[str] = []

    def _check(self):
        if self.error:
            raise self.error

    def search(self, name: str):
        self._check()
        self.searched.append(name)
        if not name.strip():
            return [], 0  # as EtsyApiShopSource does - a blank name is not a query
        hits = [s for s in self.shops.values() if name.lower() in s.name.lower()]
        return hits, len(hits)

    def get_by_id(self, shop_id: str):
        self.looked_up.append(shop_id)
        self._check()
        return self.shops.get(shop_id)

    def sales_history(self, shop_id: str):
        self._check()
        return self.history.get(shop_id)


def make_shop(shop_id: str = "1", name: str = "OldRetro", **overrides) -> Shop:
    base = dict(shop_id=shop_id, name=name, total_sales=500, review_count=40,
                review_average=4.9, listing_count=120,
                created_timestamp=1600000000, num_favorers=300,
                icon_url="https://i.etsystatic.com/icon.jpg", url="")
    base.update(overrides)
    return Shop(**base)


def make_history(shop_id: str = "1") -> SalesHistory:
    return SalesHistory(shop_id=shop_id, ratio=8.25, months=[
        MonthlySales(month="2026-05", sales=0, known=False),
        MonthlySales(month="2026-06", sales=33, known=True),
    ])


@pytest.fixture
def client(monkeypatch, tmp_path):
    """A bare Flask app with only shops_bp, wired to fakes.

    tracked_shops_store is the real TrackedStore on a tmp file - the toggle
    route's whole job is persistence, so faking it would prove nothing.
    """
    source = FakeShopSource()
    monkeypatch.setattr(container, "shop_source", source)
    monkeypatch.setattr(container, "tracked_shops_store",
                        TrackedStore(tmp_path / "tracked_shops.json"))
    # has_key must not depend on whoever runs the suite having a real Etsy key.
    monkeypatch.setattr(container, "get_etsy_api_key", lambda: "test-key")

    app = flask.Flask(__name__)
    app.register_blueprint(shops_bp)
    app.testing = True
    test_client = app.test_client()
    test_client.source = source
    return test_client


# ---------------------------------------------------------------------------
# GET /api/shops
# ---------------------------------------------------------------------------

def test_search_returns_rows_with_every_key_the_mapper_reads(client):
    client.source.shops = {"1": make_shop("1", "OldRetro")}

    body = client.get("/api/shops?query=OldRetro").get_json()

    assert body["count"] == 1
    assert body["has_key"] is True
    row = body["shops"][0]
    assert API_SHOP_KEYS <= set(row), API_SHOP_KEYS - set(row)


def test_the_fields_etsy_cannot_answer_stay_explicitly_null(client):
    """None, never 0. A zero here reads as a measured "this shop earns
    nothing" - the one mistake the whole "—" convention exists to prevent
    (#80 revenue, #81 growth, #82 niche)."""
    client.source.shops = {"1": make_shop("1")}

    row = client.get("/api/shops?query=OldRetro").get_json()["shops"][0]

    assert row["revenue"] is None
    assert row["growth"] is None
    assert row["niche"] is None
    # ...while lifetime sales *are* public per shop, unlike per listing.
    assert row["sales"] == 500


def test_a_blank_query_is_trimmed_away_before_it_reaches_the_source(client):
    """Etsy allows no way to list shops, so a blank query has no meaning.

    Note where the guarantee actually lives: the route does *not* short-
    circuit - it always calls search() and passes the trimmed string down, and
    EtsyApiShopSource is the layer that answers "" without spending a request
    (test_etsy_api_shop_source.py::test_empty_query_never_costs_a_request).
    What the route owns is the trim, so a query of spaces cannot arrive as a
    non-empty name that the source would then take to Etsy."""
    body = client.get("/api/shops?query=   ").get_json()

    assert body == {"shops": [], "count": 0, "has_key": True}
    assert client.source.searched == [""], "an untrimmed query would be a real request"


def test_a_missing_query_parameter_behaves_like_an_empty_one(client):
    response = client.get("/api/shops")

    assert response.status_code == 200
    assert response.get_json()["shops"] == []


def test_a_shop_without_its_own_url_gets_one_built_from_its_name(client):
    client.source.shops = {"1": make_shop("1", "OldRetro", url="")}

    row = client.get("/api/shops?query=OldRetro").get_json()["shops"][0]

    assert row["etsy_url"] == "https://www.etsy.com/shop/OldRetro"


# ---------------------------------------------------------------------------
# GET /api/shops/<id> - and the routing trap it shares with /shops/tracked
# ---------------------------------------------------------------------------

def test_a_single_shop_is_served_by_id(client):
    client.source.shops = {"1": make_shop("1")}

    body = client.get("/api/shops/1").get_json()

    assert [row["shop_id"] for row in body["shops"]] == ["1"]


def test_an_unknown_shop_is_a_json_404_not_an_html_page(client):
    """Same contract as the listings side: design/'s shared/api.ts reads the
    body as text first, on the promise that Flask answers {"error": ...}."""
    response = client.get("/api/shops/999")

    assert response.status_code == 404
    assert response.is_json, response.get_data(as_text=True)[:120]
    assert response.get_json()["error"]
    assert "<html" not in response.get_data(as_text=True).lower()


def test_tracked_is_never_parsed_as_a_shop_id(client):
    """/api/shops/tracked and /api/shops/<id> share a prefix, and the wrong
    winner is a silent failure: the bookmarks page would answer 404 "Магазин
    не знайдено" and read as an empty bookmark list rather than a routing bug.

    What actually protects it is Werkzeug's rule precedence - a rule with no
    converter beats one with a converter regardless of registration order -
    *not* the <int:> on the route below, contrary to that route's own
    docstring (measured: dropping <int:> keeps this test green). Which is
    exactly why the outcome is pinned here rather than the mechanism: #124
    moves these routes, and the guarantee has to survive whatever order they
    come back in."""
    client.source.shops = {"1": make_shop("1")}
    client.post("/api/shops/1/track")

    response = client.get("/api/shops/tracked")

    assert response.status_code == 200
    assert [row["shop_id"] for row in response.get_json()["shops"]] == ["1"]


def test_a_non_numeric_shop_id_never_reaches_the_handler(client):
    """This is what the <int:> converter really buys: Etsy shop ids are
    numeric, so /api/shops/<word> is a typo or a stale link, and it is
    rejected at routing instead of being sent to Etsy as a lookup.

    Asserted on the *lookup*, not the status code: without the converter the
    handler runs and answers its own 404 for the same URL, so a status check
    alone cannot tell the two apart (measured)."""
    assert client.get("/api/shops/abc").status_code == 404
    assert client.source.looked_up == [], "a non-numeric id was sent to the source"


def test_tracked_costs_no_request_when_nothing_is_bookmarked(client):
    """Etsy has no shop batch endpoint - hydrating bookmarks is one request
    per shop, so the empty short-circuit is a real saving, not a micro-opt."""
    client.source.error = EtsyApiError("must not be reached")

    response = client.get("/api/shops/tracked")

    assert response.status_code == 200
    assert response.get_json() == {"shops": []}


# ---------------------------------------------------------------------------
# GET /api/shops/<id>/sales-history
# ---------------------------------------------------------------------------

def test_sales_history_carries_the_method_and_the_unknown_flag(client):
    """`known: false` must survive to the frontend as its own field: a month
    before the shop's first review is invisible to this estimate, and
    rendering it as 0 erased two months of confirmed selling on a real shop."""
    client.source.history = {"1": make_history("1")}

    body = client.get("/api/shops/1/sales-history").get_json()

    assert API_SALES_HISTORY_KEYS <= set(body), API_SALES_HISTORY_KEYS - set(body)
    assert body["method"] == "reviews", "a second method (#46) must be tellable apart"
    assert body["ratio"] == 8.25
    assert API_MONTH_KEYS <= set(body["months"][0])
    assert [m["known"] for m in body["months"]] == [False, True]


def test_no_estimable_history_is_a_404_not_an_error(client):
    """"This shop has no reviews to derive an estimate from" and "no such
    shop" are both "no chart" - neither is a failure, and neither may be
    reported as one."""
    response = client.get("/api/shops/1/sales-history")

    assert response.status_code == 404
    assert response.is_json
    assert response.get_json()["error"]


# ---------------------------------------------------------------------------
# The error path - EtsyApiError must never reach the user as HTML
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/api/shops?query=OldRetro",
    "/api/shops/1",
    "/api/shops/1/sales-history",
    "/api/shops/tracked",
])
def test_an_etsy_failure_is_a_json_502_on_every_route_that_can_hit_the_api(
        client, path, monkeypatch):
    """502, not 500: Flask's default 500 page is HTML, which design/'s
    shared/api.ts can only surface as a parse error rather than the rate-limit
    message the user needs to see."""
    monkeypatch.setattr(container, "tracked_shops_store", _StubTracked({"1"}))
    client.source.error = EtsyApiError("Etsy повернув 429")

    response = client.get(path)

    assert response.status_code == 502, path
    assert response.is_json, path
    assert response.get_json()["error"] == "Etsy повернув 429", path


class _StubTracked:
    """A non-empty tracked set, so /api/shops/tracked reaches the source
    instead of short-circuiting on "nothing bookmarked"."""

    def __init__(self, ids):
        self.ids = set(ids)

    def load(self):
        return set(self.ids)


# ---------------------------------------------------------------------------
# POST /api/shops/<id>/track
# ---------------------------------------------------------------------------

def test_track_toggles_and_reports_the_new_state(client):
    on = client.post("/api/shops/1/track").get_json()
    off = client.post("/api/shops/1/track").get_json()

    assert on == {"ok": True, "tracked": True}
    assert off == {"ok": True, "tracked": False}
    assert container.tracked_shops_store.load() == set()


def test_a_bookmark_is_reflected_in_the_search_payload(client):
    """`tracked` is our own state, not Etsy's - the star has to light up on
    the row the very next time the grid is fetched."""
    client.source.shops = {"1": make_shop("1")}
    client.post("/api/shops/1/track")

    row = client.get("/api/shops?query=OldRetro").get_json()["shops"][0]

    assert row["tracked"] is True


def test_the_shop_id_is_a_string_in_the_payload(client):
    """The route takes an <int:> and the store keys on str(). A regression to
    an int key would make the toggle write "1" and the payload read 1, so the
    star would never light up - and no status code would change."""
    client.source.shops = {"1": make_shop("1")}
    client.post("/api/shops/1/track")

    row = client.get("/api/shops/1").get_json()["shops"][0]

    assert row["shop_id"] == "1"
    assert row["tracked"] is True


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
