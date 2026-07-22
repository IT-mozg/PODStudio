# -*- coding: utf-8 -*-
"""Controller for switching, searching, and browsing Etsy listing sources."""

from flask import Blueprint, jsonify, request

import container
from models.etsy_api_listing_source import EtsyApiError
from models.listing_source_registry import UnsupportedByActiveSource

listings_bp = Blueprint("listings", __name__, url_prefix="/api")


@listings_bp.get("/sources")
def api_sources():
    """All listing sources the UI can switch between, plus which one is
    currently active - powers the source-switch tabs above the search bar."""
    return jsonify({
        "sources": [{"id": s.id, "label": s.label} for s in container.listing_source.available()],
        "active": container.listing_source.active_id,
    })


@listings_bp.post("/sources")
def api_set_source():
    data = request.get_json(force=True)
    source_id = data.get("id")
    try:
        container.listing_source.set_active(source_id)
    except KeyError:
        return jsonify({"error": f'Невідоме джерело: "{source_id}"'}), 400
    return jsonify({"ok": True, "active": source_id})


@listings_bp.post("/search")
def api_search():
    """Point the active listing source at a new query. Does not itself hit
    the network - the first /api/pages or /api/listings call after this
    does, and any Etsy API error surfaces there."""
    data = request.get_json(force=True)
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Введи пошуковий запит"}), 400
    try:
        container.listing_source.search(query)
    except UnsupportedByActiveSource as e:
        return jsonify({"error": str(e)}), 400
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
    """Manual "save the page, drag it in" import (see
    models/listing_source.HtmlPageListingSource). Only works while the
    "saved_pages" source is active - add_source() on the Etsy API source
    raises NotImplementedError, since "uploading a file" makes no sense for
    a live search."""
    try:
        saved = 0
        for f in request.files.getlist("files"):
            saved += container.listing_source.add_source(file_storage=f, filename=f.filename)
    except NotImplementedError:
        return jsonify({"error": "Активне джерело лістингів не підтримує "
                                 "завантаження файлів - перемкнись на «Збережені сторінки»."}), 501
    if saved == 0:
        return jsonify({"error": "Потрібен .html файл збереженої сторінки "
                                 "(Chrome: Cmd+S -> 'Веб-сторінка повністю')"}), 400
    return jsonify({"saved": saved})
