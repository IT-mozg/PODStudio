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

import threading

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
