# -*- coding: utf-8 -*-
"""Controller for searching and browsing Etsy listings."""

from flask import Blueprint, jsonify, request

import container
from models.etsy_api_listing_source import EtsyApiError

listings_bp = Blueprint("listings", __name__, url_prefix="/api")


@listings_bp.post("/search")
def api_search():
    """Point the active listing source at a new query. Does not itself hit
    the network - the first /api/pages or /api/listings call after this
    does, and any Etsy API error surfaces there."""
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


@listings_bp.post("/upload")
def api_upload():
    """Manual "save the page, drag it in" import - kept working in the
    backend (see models/listing_source.HtmlPageListingSource) even though
    the active source is the Etsy API and the UI no longer exposes a drop
    zone for it."""
    try:
        saved = 0
        for f in request.files.getlist("files"):
            saved += container.listing_source.add_source(file_storage=f, filename=f.filename)
    except NotImplementedError:
        return jsonify({"error": "Поточне джерело лістингів (Etsy API) не підтримує "
                                 "завантаження файлів."}), 501
    if saved == 0:
        return jsonify({"error": "Потрібен .html файл збереженої сторінки "
                                 "(Chrome: Cmd+S -> 'Веб-сторінка повністю')"}), 400
    return jsonify({"saved": saved})
