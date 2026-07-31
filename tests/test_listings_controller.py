# -*- coding: utf-8 -*-
"""controllers/listings_controller.py - the HTTP contract, no network (#117).

The safety net for #120/#124/#125, which move payload building and route
logic out of container.py. Everything asserted here is observable through
HTTP alone, so the move may rearrange any amount of Python without touching
a line of this file - and a rearrangement that changes what design/ receives
fails immediately.

Three things are under test, in order of how expensive they are to lose:

  * the *shape* of every response, not just its status code. A 200 whose
    payload lost a key is exactly the failure mode of a payload refactor,
    and nothing else catches it: Flask does not type its JSON, oxlint never
    sees Python, and design/'s mapper reads the missing field as undefined
    rather than raising.
  * the error path. design/'s shared/api.ts reads the body as text and only
    then parses it, on the promise that Flask answers {"error": ...} rather
    than an HTML error page. A route that lets an exception escape breaks
    that promise silently - the user sees "Unexpected token '<'".
  * that no route needs a key or a network. Every collaborator here is a
    fake; there is deliberately no test that would pass only on a machine
    with a working Etsy key.

`container` is a module of singletons, so every substitution goes through
monkeypatch.setattr - reassigning container.listing_source in a test would
leak into whatever runs next.

GET /api/listings/<lid>/similar is NOT here: tests/test_similar_listings.py
already covers that route end to end.
"""

import flask
import pytest

import container
from controllers.listings_controller import listings_bp
from models.etsy_api_client import EtsyApiError
from models.listing_source import Listing, ListingPage, ListingSource
from models.tracked_store import TrackedStore

# ---------------------------------------------------------------------------
# The Python -> TypeScript contract.
#
# Source of truth: design/src/pages/listings/listingMapper.ts. These are the
# keys mapApiListing()/mapApiListingDetail() actually read - not every key
# container.py emits, on purpose. A payload growing a field is harmless; one
# losing a field listed here is a blank column in the grid that no Python
# test would otherwise notice.
# ---------------------------------------------------------------------------

API_LISTING_KEYS = {
    "lid", "title", "thumb", "shop_id", "shop_name", "views", "sales",
    "revenue", "revenue_currency", "age_months", "tags", "tracked",
}

API_LISTING_DETAIL_KEYS = API_LISTING_KEYS | {
    "description", "price_amount", "price_divisor", "price_currency",
    "photos", "etsy_url", "category_path", "who_made", "when_made",
    "materials", "style", "processing_min", "processing_max",
    "is_personalizable", "has_variations", "num_favorers",
    "production_partners", "conv_rate_pct",
}


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeListingSource(ListingSource):
    """Answers from a dict instead of Etsy, or raises on every call.

    `search` is not on the ListingSource port at all - the controller calls
    it anyway (see api_search). Kept here so the fake matches what the route
    actually uses rather than what the interface promises.
    """

    def __init__(self, listings=None, pages=None, error: Exception = None):
        self.listings = dict(listings or {})
        self.pages = list(pages or [])
        self.error = error
        self.searched: list[str] = []

    def _check(self):
        if self.error:
            raise self.error

    def search(self, query: str) -> None:
        self._check()
        self.searched.append(query)

    def list_pages(self) -> list[ListingPage]:
        self._check()
        return list(self.pages)

    def get_page(self, page_id: str) -> dict:
        self._check()
        known = {p.id for p in self.pages}
        return dict(self.listings) if page_id in known else {}

    def get_all(self) -> dict:
        self._check()
        return dict(self.listings)

    def get_by_ids(self, lids: list[str]) -> dict:
        self._check()
        return {lid: self.listings[lid] for lid in lids if lid in self.listings}


class FakeHistoryStore:
    """Only load() is reached from these routes. Real HistoryStore would read
    the developer's own history.json, making the payload machine-dependent."""

    def __init__(self, entries=None):
        self.entries = dict(entries or {})

    def load(self) -> dict:
        return dict(self.entries)


class FakeTaxonomy:
    """container.listing_detail_payload calls path_name() for every listing;
    the real one fetches a 365 KB taxonomy tree from Etsy."""

    def path_name(self, taxonomy_id: int) -> str:
        return "Clothing > T-Shirts" if taxonomy_id else ""


class FakeFxRates:
    """`rate=None` is the "FX service never reachable" case, which must keep
    a price out of the dollar-denominated conversion table rather than
    passing it through 1:1."""

    def __init__(self, rate: float | None = 1.0):
        self.rate = rate

    def to_usd(self, amount: float, currency: str) -> float | None:
        return None if self.rate is None else amount * self.rate


def make_listing(lid: str = "77", **overrides) -> Listing:
    base = dict(
        lid=lid,
        title=f"Listing {lid}",
        remote_img=f"https://i.etsystatic.com/il_fullxfull.{lid}.jpg",
        num_favorers=12,
        views=1000,
        created_timestamp=1700000000,
        shop_id="7",
        shop_name="TestShop",
        tags=["retro", "tee"],
        description="A long description.",
        price_amount=2499,
        price_divisor=100,
        price_currency="USD",
        images=[f"https://i.etsystatic.com/il_fullxfull.{lid}_a.jpg"],
        url=f"https://www.etsy.com/listing/{lid}/slug",
        taxonomy_id=1234,
        who_made="i_did",
        when_made="made_to_order",
        materials=["cotton"],
        style=["retro"],
        processing_min=1,
        processing_max=3,
        is_personalizable=True,
        has_variations=True,
        production_partners=[{"name": "A print shop", "location": "NY"}],
    )
    base.update(overrides)
    return Listing(**base)


@pytest.fixture
def client(monkeypatch, tmp_path):
    """A test client wired to fakes, plus the FakeListingSource it talks to.

    A bare Flask app with one blueprint rather than app.py's: importing app.py
    would register all seven blueprints - including the generation one, which
    spends money - to exercise five routes.

    tracked_store is the *real* TrackedStore on a tmp file, not a fake: the
    toggle route's whole job is persistence, and a fake would assert that the
    fake works.
    """
    source = FakeListingSource()
    monkeypatch.setattr(container, "listing_source", source)
    monkeypatch.setattr(container, "history_store", FakeHistoryStore())
    monkeypatch.setattr(container, "tracked_store",
                        TrackedStore(tmp_path / "tracked.json"))
    monkeypatch.setattr(container, "taxonomy", FakeTaxonomy())
    monkeypatch.setattr(container, "fx_rates", FakeFxRates())
    # has_key must not depend on whoever runs the suite having a real key in
    # ui_config.json or in the environment.
    monkeypatch.setattr(container, "get_api_key", lambda: "test-key")
    # listings_payload builds a draft prompt for every row, and the template
    # comes from ui_config.json - the one file in this repo that holds real
    # API keys. Pinned so no test reads it.
    monkeypatch.setattr(container, "base_template", lambda: "{theme} / {background}")

    app = flask.Flask(__name__)
    app.register_blueprint(listings_bp)
    app.testing = True
    test_client = app.test_client()
    test_client.source = source
    return test_client


def one_page(client, listings: dict) -> None:
    """Point the fake at a single page holding `listings`."""
    client.source.listings = listings
    client.source.pages = [ListingPage(id="p1", label="Сторінка 1",
                                       count=len(listings))]


# ---------------------------------------------------------------------------
# POST /api/search
# ---------------------------------------------------------------------------

def test_search_rejects_an_empty_query_without_touching_the_source(client):
    """400 rather than a search for "": an empty Etsy query is a wasted
    request against a 5000/day key, and the message is shown verbatim."""
    response = client.post("/api/search", json={"query": "   "})

    assert response.status_code == 400
    assert response.get_json()["error"]
    assert client.source.searched == []


def test_search_trims_the_query_and_echoes_it_back(client):
    response = client.post("/api/search", json={"query": "  retro tee  "})

    assert response.status_code == 200
    assert response.get_json() == {"ok": True, "query": "retro tee"}
    assert client.source.searched == ["retro tee"]


# ---------------------------------------------------------------------------
# GET /api/pages, GET /api/listings
# ---------------------------------------------------------------------------

def test_pages_reports_the_sources_pages(client):
    one_page(client, {"77": make_listing("77")})

    body = client.get("/api/pages").get_json()

    assert body["files"] == [{"name": "p1", "label": "Сторінка 1", "count": 1}]


def test_listings_defaults_to_the_first_page(client):
    one_page(client, {"77": make_listing("77")})

    body = client.get("/api/listings").get_json()

    assert [row["lid"] for row in body["listings"]] == ["77"]
    assert body["pages"] == 1
    assert body["has_key"] is True
    assert body["cost"] == container.COST


def test_listings_rows_carry_every_key_the_mapper_reads(client):
    """The regression this whole file exists for: #120 moves payload building
    out of container.py, and a key dropped in that move is invisible in Python
    and renders as an empty cell in React."""
    one_page(client, {"77": make_listing("77")})

    row = client.get("/api/listings").get_json()["listings"][0]

    assert API_LISTING_KEYS <= set(row), API_LISTING_KEYS - set(row)


def test_listings_answers_an_empty_source_with_an_empty_list(client):
    """No pages is not an error - it is the state before the first search.
    A 200 with [] is what design/ distinguishes from a 502."""
    body = client.get("/api/listings").get_json()

    assert body["listings"] == []
    assert body["pages"] == 0


def test_listings_serves_a_named_page(client):
    one_page(client, {"77": make_listing("77")})

    named = client.get("/api/listings?file=p1").get_json()
    unknown = client.get("/api/listings?file=nope").get_json()

    assert [row["lid"] for row in named["listings"]] == ["77"]
    assert unknown["listings"] == []


# ---------------------------------------------------------------------------
# GET /api/listing-info
# ---------------------------------------------------------------------------

def test_listing_info_returns_only_the_ids_asked_for(client):
    client.source.listings = {"1": make_listing("1"), "2": make_listing("2")}

    body = client.get("/api/listing-info?lids=2").get_json()

    assert [row["lid"] for row in body["listings"]] == ["2"]


def test_listing_info_is_a_batch_route_and_never_404s(client):
    """Unlike /listings/<id>, an unknown id here is an empty list with a 200.
    The two behaviours are deliberately different (see the route docstring),
    so a refactor that unifies them would be a real change in contract."""
    response = client.get("/api/listing-info?lids=999")

    assert response.status_code == 200
    assert response.get_json()["listings"] == []


# ---------------------------------------------------------------------------
# GET /api/listings/<lid>
# ---------------------------------------------------------------------------

def test_listing_detail_carries_every_key_the_detail_mapper_reads(client):
    client.source.listings = {"77": make_listing("77")}

    body = client.get("/api/listings/77").get_json()
    row = body["listings"][0]

    assert API_LISTING_DETAIL_KEYS <= set(row), API_LISTING_DETAIL_KEYS - set(row)
    assert row["etsy_url"] == "https://www.etsy.com/listing/77/slug", \
        "Etsy's own URL carries the slug; the id-built fallback does not"


def test_an_unknown_listing_is_a_json_404_not_an_html_page(client):
    """design/'s repository tells an api-reported 404 ("no such listing")
    apart from an inferred one (a stale Flask process serving no such route).
    Only a JSON body with an `error` key makes that distinction possible."""
    response = client.get("/api/listings/99")

    assert response.status_code == 404
    assert response.is_json, response.get_data(as_text=True)[:120]
    assert response.get_json()["error"]
    assert "<html" not in response.get_data(as_text=True).lower()


def test_a_missing_price_leaves_the_estimate_out_rather_than_zeroing_it(client):
    """conv_rate_pct is derived from a USD price. With no price there is
    nothing to look up, and None is what the UI renders as "—"."""
    client.source.listings = {"77": make_listing("77", price_amount=None)}

    row = client.get("/api/listings/77").get_json()["listings"][0]

    assert row["conv_rate_pct"] is None
    assert row["price_amount"] is None


def test_an_unreachable_fx_service_does_not_invent_a_conversion(client,
                                                               monkeypatch):
    """A 1:1 fallback would be indistinguishable from a real conversion for a
    USD listing and silently wrong for every other one."""
    monkeypatch.setattr(container, "fx_rates", FakeFxRates(rate=None))
    client.source.listings = {"77": make_listing("77", price_currency="PLN")}

    row = client.get("/api/listings/77").get_json()["listings"][0]

    assert row["conv_rate_pct"] is None


# ---------------------------------------------------------------------------
# The error path - EtsyApiError must never reach the user as HTML
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/api/pages",
    "/api/listings",
    "/api/listing-info?lids=77",
    "/api/listings/77",
    "/api/tracked",
])
def test_an_etsy_failure_is_a_json_502_on_every_route_that_can_hit_the_api(
        client, path, monkeypatch):
    """502, not 500: a missing key or a rate limit is the upstream's problem,
    and the message has to survive to the user. Flask's default 500 page is
    HTML, which design/'s shared/api.ts can only report as a parse error."""
    monkeypatch.setattr(container, "tracked_store", _StubTracked({"77"}))
    client.source.error = EtsyApiError("Etsy повернув 429")

    response = client.get(path)

    assert response.status_code == 502, path
    assert response.is_json, path
    assert response.get_json()["error"] == "Etsy повернув 429", path


class _StubTracked:
    """A non-empty tracked set, so /api/tracked reaches the source instead of
    short-circuiting on "nothing bookmarked"."""

    def __init__(self, ids):
        self.ids = set(ids)

    def load(self):
        return set(self.ids)


# ---------------------------------------------------------------------------
# POST /api/listings/<lid>/track, GET /api/tracked
# ---------------------------------------------------------------------------

def test_track_toggles_and_reports_the_new_state(client):
    on = client.post("/api/listings/77/track").get_json()
    off = client.post("/api/listings/77/track").get_json()

    assert on == {"ok": True, "tracked": True}
    assert off == {"ok": True, "tracked": False}
    assert container.tracked_store.load() == set()


def test_tracked_lists_bookmarks_regardless_of_the_current_search(client):
    """A bookmark outlives the query it was made under: nothing is searched
    here, and the listing is still hydrated by id."""
    client.source.listings = {"77": make_listing("77")}
    client.post("/api/listings/77/track")

    body = client.get("/api/tracked").get_json()

    assert [row["lid"] for row in body["listings"]] == ["77"]
    assert body["listings"][0]["tracked"] is True


def test_tracked_costs_no_request_when_nothing_is_bookmarked(client):
    """The short-circuit is the point: hydrating an empty set would still be
    one Etsy batch call per page load."""
    client.source.error = EtsyApiError("must not be reached")

    response = client.get("/api/tracked")

    assert response.status_code == 200
    assert response.get_json() == {"listings": []}


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
