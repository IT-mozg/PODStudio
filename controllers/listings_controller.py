# -*- coding: utf-8 -*-
"""Controller for browsing locally imported Etsy listing pages."""

from flask import Blueprint, jsonify, request

import container

listings_bp = Blueprint("listings", __name__, url_prefix="/api")


@listings_bp.get("/pages")
def api_pages():
    pages = container.listing_source.list_pages()
    return jsonify({"files": [{"name": p.id, "count": p.count} for p in pages]})


@listings_bp.get("/listings")
def api_listings():
    pages = container.listing_source.list_pages()
    name = request.args.get("file")
    if name:
        found = container.listing_source.get_page(name)
    elif pages:
        found = container.listing_source.get_page(pages[0].id)  # default to the first page
    else:
        found = {}
    return jsonify({"listings": container.listings_payload(found), "pages": len(pages),
                    "has_key": bool(container.get_api_key()), "cost": container.COST})


@listings_bp.get("/listing-info")
def api_listing_info():
    """Data (title/thumbnail/draft prompt) for specific lids, regardless of
    which page they are currently shown on - needed by the generate
    confirmation modal, which can include listings picked from different
    pagination pages."""
    lids = {x for x in request.args.get("lids", "").split(",") if x}
    all_listings = container.listing_source.get_all()
    found = {lid: listing for lid, listing in all_listings.items() if lid in lids}
    return jsonify({"listings": container.listings_payload(found)})


@listings_bp.post("/upload")
def api_upload():
    saved = 0
    for f in request.files.getlist("files"):
        saved += container.listing_source.add_source(file_storage=f, filename=f.filename)
    if saved == 0:
        return jsonify({"error": "Потрібен .html файл збереженої сторінки "
                                 "(Chrome: Cmd+S -> 'Веб-сторінка повністю')"}), 400
    return jsonify({"saved": saved})
