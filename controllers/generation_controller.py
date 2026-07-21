# -*- coding: utf-8 -*-
"""Controller for the design generation queue: starting new batches, single
regenerations, progress polling and prompt drafts."""

from pathlib import Path

from flask import Blueprint, jsonify, request

import container
from models import generate_designs as engine

generation_bp = Blueprint("generation", __name__, url_prefix="/api")


@generation_bp.post("/generate")
def api_generate():
    data = request.get_json(force=True)
    entries = data.get("items", [])
    model = data.get("model", "gpt-image-2")
    quality = data.get("quality", "high")
    if not entries:
        return jsonify({"error": "Нічого не вибрано"}), 400
    if not container.get_api_key():
        return jsonify({"error": "Немає API-ключа. Додай його в налаштуваннях "
                                 "(іконка шестерні вгорі)."}), 400
    listings = container.listing_source.get_all()
    items = []
    for e in entries:
        lid = e.get("lid")
        listing = listings.get(lid)
        if not listing:
            continue
        prompt = (e.get("prompt") or "").strip() or None
        items.append({"lid": lid, "title": listing.title, "status": "wait",
                      "prompt": prompt, "model": model, "quality": quality})
    if not items:
        return jsonify({"error": "Нічого не вибрано"}), 400
    # A fresh batch from the Listings tab - this is exactly when the user
    # expects previous results to be cleared and see a clean list.
    result = container.gen_queue.start_new(items)
    return jsonify({"started": len(items), "queued": result == "queued"})


@generation_bp.post("/regenerate")
def api_regenerate():
    data = request.get_json(force=True)
    lid = data.get("lid", "")
    listings = container.listing_source.get_all()
    history = container.history_store.load()
    listing = listings.get(lid)
    title = (listing.title if listing else None) or (history.get(lid) or {}).get("title")
    if not title:
        return jsonify({"error": "Лістинг не знайдено"}), 404
    if not container.get_api_key():
        return jsonify({"error": "Немає API-ключа. Додай його в "
                                 "налаштуваннях."}), 400
    prev = (history.get(lid) or {}).get("file", "")
    item = {"lid": lid, "title": title, "status": "wait",
            "prompt": (data.get("prompt") or "").strip() or None,
            "source": data.get("source", "ref"),
            "prev_file": prev, "out_path": prev or None,
            "model": data.get("model", "gpt-image-2"),
            "quality": data.get("quality", "high")}
    # Single regeneration - append/update in place, never wipe other results.
    result = container.gen_queue.enqueue([item])
    return jsonify({"started": 1, "queued": result == "queued"})


@generation_bp.get("/job")
def api_job():
    return jsonify(container.gen_queue.status())


@generation_bp.post("/stop")
def api_stop():
    container.gen_queue.request_stop()
    return jsonify({"stopping": True})


@generation_bp.get("/prompt/<lid>")
def api_prompt(lid):
    listings = container.listing_source.get_all()
    history = container.history_store.load()
    listing = listings.get(lid)
    title = (listing.title if listing else None) or (history.get(lid) or {}).get("title") or ""
    h = history.get(lid) or {}
    saved = h.get("prompt")
    bg = container.effective_bg(lid) or h.get("background", "")

    ref_thumb = f"/refs/{lid}.jpg" if (engine.REFS_DIR / f"{lid}.jpg").exists() else ""
    result_name = Path(h.get("file", "")).name
    result_thumb = (f"/outputs/{result_name}"
                    if result_name and (engine.OUT_DIR / result_name).exists() else "")

    return jsonify({
        "prompt": saved or container.build_prompt(title, bg),
        "default_prompt": container.build_prompt(title, bg),
        "is_custom": bool(saved),
        "title": title,
        "ref_thumb": ref_thumb,
        "result_thumb": result_thumb,
    })
