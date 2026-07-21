# -*- coding: utf-8 -*-
"""Controller for the generation history list."""

from pathlib import Path

from flask import Blueprint, jsonify, request

import container
from models import generate_designs as engine

history_bp = Blueprint("history", __name__, url_prefix="/api")


@history_bp.get("/history")
def api_history():
    history = container.history_store.load()
    out = []
    for lid, e in sorted(history.items(),
                         key=lambda kv: kv[1].get("date", ""), reverse=True):
        fname = Path(e.get("file", "")).name
        exists = bool(fname) and (engine.OUT_DIR / fname).exists()
        out.append({"lid": lid, "title": e.get("title", ""),
                    "date": e.get("date", ""), "background": e.get("background", ""),
                    "file": fname if exists else "",
                    "custom_prompt": bool(e.get("prompt"))})
    return jsonify({"history": out})


@history_bp.post("/forget")
def api_forget():
    lid = request.get_json(force=True).get("lid", "")
    container.history_store.forget(lid)
    return jsonify({"ok": True})
