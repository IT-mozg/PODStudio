# -*- coding: utf-8 -*-
"""Controller for searching and browsing Etsy listings."""

from flask import Blueprint, jsonify, request

import container
from models.conversion_rate import est_sales
from models.etsy_api_client import EtsyApiError

listings_bp = Blueprint("listings", __name__, url_prefix="/api")


@listings_bp.post("/search")
def api_search():
    """Point the listing source at a new query. Does not itself hit the
    network - the first /api/pages or /api/listings call after this does,
    and any Etsy API error surfaces there."""
    data = request.get_json(force=True)
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Введи пошуковий запит"}), 400
    container.listing_source.search(query)
    return jsonify({"ok": True, "query": query})


@listings_bp.get("/pages")
def api_pages():
    try:
        pages = container.listing_source.list_pages()
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"files": [{"name": p.id, "label": p.label, "count": p.count}
                              for p in pages]})


@listings_bp.get("/listings")
def api_listings():
    try:
        pages = container.listing_source.list_pages()
        name = request.args.get("file")
        if name:
            found = container.listing_source.get_page(name)
        elif pages:
            found = container.listing_source.get_page(pages[0].id)  # default to the first page
        else:
            found = {}
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"listings": container.listings_payload(found), "pages": len(pages),
                    "has_key": bool(container.get_api_key()), "cost": container.COST})


@listings_bp.get("/listing-info")
def api_listing_info():
    """Data (title/thumbnail/draft prompt) for specific lids, regardless of
    which page they are currently shown on - needed by the generate
    confirmation modal, which can include listings picked from different
    pagination pages. Uses get_by_ids() rather than get_all(), which for an
    API-backed source would mean walking every page just to find a handful
    of ids."""
    lids = [x for x in request.args.get("lids", "").split(",") if x]
    try:
        found = container.listing_source.get_by_ids(lids)
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"listings": container.listings_payload(found)})


@listings_bp.get("/listings/<int:lid>")
def api_listing(lid):
    """One listing with its full detail payload - what design/'s
    ListingDetailPage renders.

    Separate from /listing-info (which is a batch endpoint, answers 200 with
    an empty list for an unknown id, and returns the lean grid payload)
    precisely so a missing listing is a real 404 with an {"error": ...} body.
    design/'s repository distinguishes that from an *inferred* 404 - a route
    that isn't registered at all, i.e. a stale Flask process - and only the
    api-reported one means "no such listing". See commit 35c5195, which fixed
    exactly this confusion on the shops side.

    Registered with an <int:> converter: Etsy listing ids are always numeric,
    and it keeps this route from swallowing any future /listings/<word> path."""
    try:
        found = container.listing_source.get_by_ids([str(lid)])
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    listing = found.get(str(lid))
    if not listing:
        return jsonify({"error": "Лістинг не знайдено"}), 404
    return jsonify({"listings": [container.listing_detail_payload(listing)]})


SIMILAR_LIMIT = 10


@listings_bp.get("/listings/<int:lid>/similar")
def api_similar_listings(lid):
    """Listings similar to this one, for the detail page's carousel (#86).

    "Similar" is a second Etsy relevance search on the opening of this
    listing's title - Etsy exposes no similar/recommended endpoint at all -
    so the response carries the `query` it used and the UI states it
    verbatim rather than presenting the result as Etsy's own recommendation.

    Uses find_similar, never search(): search() would repoint the shared
    listing source and wipe the page cache, resetting the grid the user has
    open in the other tab of the same app."""
    try:
        found = container.listing_source.get_by_ids([str(lid)])
        listing = found.get(str(lid))
        if not listing:
            return jsonify({"error": "Лістинг не знайдено"}), 404
        # Walk the query ladder widest-last, keeping the best rung. A shorter
        # query is strictly broader, so in practice the first full rung wins
        # or the last one does - but "best so far" is what the UI promises,
        # and it costs nothing to actually guarantee it.
        query, similar = "", {}
        for rung in container.similar_query_ladder(listing.title):
            found = container.listing_source.find_similar(
                rung, limit=SIMILAR_LIMIT, exclude=str(lid))
            if len(found) > len(similar):
                query, similar = rung, found
            if len(similar) >= SIMILAR_LIMIT:
                break
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502

    # Ranked by the modelled sales estimate, per the project owner's call -
    # Etsy publishes no per-listing sales figure to anyone. Sorted on the
    # estimate computed here rather than on the payload's "sales", because
    # listings_payload flattens est_sales()'s None to 0 (see its comment);
    # sorting on that would rank "couldn't be computed" as if it were a
    # measured zero instead of putting it last.
    def rank(item) -> float:
        est = est_sales(item.views, container.listing_price_usd(item))
        return -1 if est is None else est

    ordered = sorted(similar.values(), key=rank, reverse=True)
    rows = container.listings_payload({item.lid: item for item in ordered})
    return jsonify({"listings": rows, "query": query})


@listings_bp.post("/listings/<lid>/track")
def api_toggle_track(lid):
    """Toggles the user's own "tracked" bookmark on a listing - unrelated to
    Etsy's data, purely our own persisted state (see models/tracked_store.py)."""
    tracked = container.tracked_store.toggle(lid)
    return jsonify({"ok": True, "tracked": tracked})


@listings_bp.get("/tracked")
def api_tracked():
    """Every tracked listing, independent of the current search.

    Needed because a bookmark outlives the query it was made under: the
    tracked ids come from our own store, then get hydrated through
    get_by_ids() (one batch call for the whole set, not one per listing)."""
    lids = sorted(container.tracked_store.load())
    if not lids:
        return jsonify({"listings": []})
    try:
        found = container.listing_source.get_by_ids(lids)
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"listings": container.listings_payload(found)})
