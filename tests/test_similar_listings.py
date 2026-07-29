# -*- coding: utf-8 -*-
"""EtsyApiListingSource.find_similar() - state isolation, no network (#86).

The detail page's "similar listings" carousel runs a second Etsy query while
the user still has a search open on the grid. Both live on the same shared
container.listing_source instance, so the one thing that can go wrong here is
invisible in the UI of the page that caused it: the carousel repoints the
source, and the *other* page silently loses its query and its cached pages.
The obvious implementation - call search(), then read the results - does
exactly that, which is why these tests exist.

Also covered: the per-query cache, since without it every re-open of the same
listing costs another 2 requests against a 5 req/s, 5000/day key.
"""

import dataclasses
import threading

import flask

import container
from models.etsy_api_listing_source import EtsyApiListingSource


class FakeClient:
    """Counts requests; every id it is asked to batch comes back populated."""

    def __init__(self):
        self.requests: list[str] = []
        self._lock = threading.Lock()

    def get(self, url: str) -> dict:
        with self._lock:
            self.requests.append(url)
        if "/listings/batch" in url:
            ids = url.split("listing_ids=")[1].split("&")[0].split("%2C")
            return {"results": [{"listing_id": int(i), "title": f"Listing {i}",
                                 "num_favorers": 3, "views": 100, "tags": [],
                                 "images": [], "shop_id": 7,
                                 "Shop": {"shop_name": "S"}}
                                for i in ids]}
        if "/shops/" in url:
            # The batch endpoint doesn't embed the Shop association on every
            # account tier, so the source falls back to this per-shop lookup.
            return {"shop_name": "S"}
        # an id search
        offset = int(url.split("offset=")[1].split("&")[0])
        limit = int(url.split("limit=")[1].split("&")[0])
        return {"count": 500,
                "results": [{"listing_id": offset + n} for n in range(limit)]}

    @property
    def searches(self) -> list[str]:
        return [u for u in self.requests if "/listings/active" in u]


def build_source(page_size: int = 3):
    source = EtsyApiListingSource(api_key_provider=lambda: "key",
                                  shared_secret_provider=lambda: "secret",
                                  page_size=page_size)
    client = FakeClient()
    source._client = client
    return source, client


def test_find_similar_leaves_the_active_search_untouched():
    """The regression this file exists for. Against an implementation built
    on search(), keywords/_page_cache/_total_count all come back wrong."""
    source, client = build_source()
    source.search("funny cat tee")
    page = source.get_page("0")           # the user is browsing page 1
    assert page and source._total_count == 500

    source.find_similar("retro sunset poster", limit=2)

    assert source.keywords == "funny cat tee"
    assert source._total_count == 500
    assert 0 in source._page_cache            # still cached, not re-fetched
    assert source.get_page("0") == page
    # Only the two calls find_similar itself makes were added on top of the
    # browsing ones - the cached page never went back to the network.
    assert len([u for u in client.searches if "retro" in u]) == 1


def test_find_similar_excludes_the_listing_itself_and_caps_the_result():
    source, _ = build_source()
    # The fake returns ids 0..limit-1, so id "0" is the listing itself.
    found = source.find_similar("cat", limit=3, exclude="0")
    assert "0" not in found
    assert len(found) == 3          # limit + 1 fetched, so 3 survive


def test_find_similar_caches_per_query():
    source, client = build_source()
    first = source.find_similar("cat", limit=2)
    second = source.find_similar("cat", limit=2)
    assert first == second
    assert len(client.searches) == 1

    source.find_similar("dog", limit=2)
    assert len(client.searches) == 2


def test_a_new_search_does_not_drop_the_similar_cache():
    """Unlike _page_cache/_id_cache: what a query matches has nothing to do
    with which search the user happens to be browsing."""
    source, client = build_source()
    source.find_similar("cat", limit=2)
    source.search("something else entirely")
    source.find_similar("cat", limit=2)
    assert len(client.searches) == 1


def test_find_similar_needs_no_prior_search():
    """The detail page can be opened straight from a URL, with the source
    never searched in this process."""
    source, _ = build_source()
    assert source.find_similar("cat", limit=2)
    assert source.keywords == ""


def test_blank_query_costs_nothing():
    source, client = build_source()
    assert source.find_similar("   ", limit=5) == {}
    assert client.requests == []


# ---------------- the query itself (container.similar_query*) ----------------

def test_similar_query_never_cuts_or_drops_a_word():
    """The word straddling the 50-character mark is taken whole, so the query
    can run past 50 - a cut word ("vintag") searches for a non-word, and
    dropping it throws away a term the seller put there deliberately."""
    title = "Vintage Retro Sunset Graphic Tee Shirt Unisex Cotton Summer Beach"
    query = container.similar_query(title)
    assert query == "Vintage Retro Sunset Graphic Tee Shirt Unisex Cotton"
    assert len(query) > container.SIMILAR_QUERY_CHARS
    assert title.startswith(query)


def test_similar_query_keeps_a_single_overlong_word_whole():
    """A first word already past the limit is still taken whole, and nothing
    follows it - the loop must not fall through to an empty query."""
    long_word = "Supercalifragilisticexpialidociousextralongsinglewordhere"
    assert len(long_word) > container.SIMILAR_QUERY_CHARS
    assert container.similar_query(f"{long_word} tail") == long_word


def test_similar_query_handles_a_short_or_empty_title():
    assert container.similar_query("Short title") == "Short title"
    assert container.similar_query("   ") == ""


def test_query_ladder_starts_specific_and_ends_broad():
    """Etsy ANDs the keywords, so the full 50-character query matched exactly
    one listing on a real title while its first three words matched ten. The
    ladder exists so the carousel isn't empty on nearly every listing."""
    ladder = container.similar_query_ladder(
        "Legend Since 1961 T Shirt - Soft Cotton T-Shirt or Hoodie")
    assert ladder[0] == container.similar_query(
        "Legend Since 1961 T Shirt - Soft Cotton T-Shirt or Hoodie")
    assert ladder[-1] == "Legend Since 1961"
    assert len(ladder) <= 3
    # Every rung is a prefix of the one before it - never a different query.
    assert all(ladder[0].startswith(rung) for rung in ladder)


def test_query_ladder_has_no_duplicate_rungs():
    """A title already at or below the floor collapses to a single rung
    rather than paying 2 Etsy requests to ask the same thing twice."""
    assert container.similar_query_ladder("Legend Since 1961") == ["Legend Since 1961"]
    assert container.similar_query_ladder("") == []

# ---------------- the route (GET /api/listings/<lid>/similar) ----------------
#
# The first Flask route test in this repo, and it exists for one reason: the
# response's `query` is quoted verbatim by the UI ("за запитом «…» нічого не
# знайшлося"), so an empty one renders as a sentence with empty quotes.


def build_client(monkeypatch, listing_title: str, similar_by_query: dict):
    """A Flask test client whose listing source answers from a dict of
    {query: {lid: Listing}} instead of the network."""
    import container as c
    from controllers.listings_controller import listings_bp

    source, _ = build_source()
    listing = source._batch_fetch(["77"])["77"]
    listing = dataclasses.replace(listing, title=listing_title)

    class FakeSource:
        def get_by_ids(self, lids):
            return {"77": listing} if "77" in lids else {}

        def find_similar(self, keywords, limit=10, exclude=""):
            return similar_by_query.get(keywords, {})

    monkeypatch.setattr(c, "listing_source", FakeSource())
    app = flask.Flask(__name__)
    app.register_blueprint(listings_bp)
    return app.test_client()


def test_route_names_the_broadest_query_it_tried_when_nothing_matched(monkeypatch):
    """The regression: `query` stayed "" because the loop only assigns it
    inside `len(found) > len(similar)`, and 0 > 0 is false."""
    title = "Legend Since 1961 T Shirt - Soft Cotton T-Shirt or Hoodie"
    client = build_client(monkeypatch, title, {})   # no rung matches anything

    body = client.get("/api/listings/77/similar").get_json()

    assert body["listings"] == []
    assert body["query"] == container.similar_query_ladder(title)[-1] != ""


def test_route_reports_the_rung_that_actually_produced_the_cards(monkeypatch):
    """Not the most specific rung tried - the one the cards came from, since
    that is what the UI tells the user it searched for."""
    title = "Legend Since 1961 T Shirt - Soft Cotton T-Shirt or Hoodie"
    ladder = container.similar_query_ladder(title)
    source, _ = build_source()
    hits = source._batch_fetch(["1", "2"])
    client = build_client(monkeypatch, title, {ladder[-1]: hits})

    body = client.get("/api/listings/77/similar").get_json()

    assert body["query"] == ladder[-1]
    assert {r["lid"] for r in body["listings"]} == {"1", "2"}


def test_route_404s_on_an_unknown_listing(monkeypatch):
    client = build_client(monkeypatch, "whatever", {})
    response = client.get("/api/listings/99/similar")
    assert response.status_code == 404
    assert response.get_json()["error"]
