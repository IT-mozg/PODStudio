# -*- coding: utf-8 -*-
"""Controller for searching Etsy shops and bookmarking them.

Mirrors listings_controller.py: HTTP in, container's shared model instances
out, EtsyApiError -> 502 so a missing key or a rate limit surfaces as a
readable message instead of a 500.
"""

from flask import Blueprint, jsonify, request

import container
from models.etsy_api_client import EtsyApiError

shops_bp = Blueprint("shops", __name__, url_prefix="/api")


@shops_bp.get("/shops")
def api_shops():
    """Shops matching ?query= (a shop name).

    Name-only because that is all Etsy allows - there is no way to list or
    rank shops by sales/rating/age (see models/etsy_api_shop_source.py). An
    empty query is answered locally with an empty list, without spending a
    request."""
    query = (request.args.get("query") or "").strip()
    try:
        shops, count = container.shop_source.search(query)
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"shops": container.shops_payload(shops), "count": count,
                    "has_key": bool(container.get_etsy_api_key())})


@shops_bp.get("/shops/tracked")
def api_tracked_shops():
    """Every tracked shop, independent of the current search - a bookmark
    outlives the query it was made under.

    Costs one Etsy request per shop that isn't cached yet (Etsy has no shop
    batch endpoint), which is why the source caps how many it will fetch in
    one go."""
    shop_ids = sorted(container.tracked_shops_store.load())
    if not shop_ids:
        return jsonify({"shops": []})
    try:
        found = container.shop_source.get_by_ids(shop_ids)
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"shops": container.shops_payload(list(found.values()))})


@shops_bp.get("/shops/<int:shop_id>")
def api_shop(shop_id):
    """One shop by id. Registered with an <int:> converter so that
    /api/shops/tracked above can never be parsed as a shop id."""
    try:
        shop = container.shop_source.get_by_id(str(shop_id))
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    if not shop:
        return jsonify({"error": "Магазин не знайдено"}), 404
    return jsonify({"shops": container.shops_payload([shop])})


@shops_bp.get("/shops/<int:shop_id>/sales-history")
def api_shop_sales_history(shop_id):
    """Estimated sales per month for the last year (issues #45/#49).

    A separate route from /shops/<id> because it is a separate cost: up to 15
    Etsy requests against a 5 req/s key on a shop seen for the first time
    today, and none at all on a second look the same day.
    The detail page fetches it on its own so the rest of the page renders
    immediately.

    404 means Etsy has no such shop *or* the shop has no reviews to derive an
    estimate from - both are "no chart", and neither is an error."""
    try:
        history = container.shop_source.sales_history(str(shop_id))
    except EtsyApiError as e:
        return jsonify({"error": str(e)}), 502
    if not history:
        return jsonify({"error": "Немає даних для оцінки продажів"}), 404
    return jsonify(container.sales_history_payload(history))


@shops_bp.post("/shops/<int:shop_id>/track")
def api_toggle_shop_track(shop_id):
    """Toggles our own "tracked" bookmark on a shop - unrelated to Etsy's
    "favorite shop" feature, which needs OAuth and the user's own account."""
    tracked = container.tracked_shops_store.toggle(str(shop_id))
    return jsonify({"ok": True, "tracked": tracked})
