# -*- coding: utf-8 -*-
"""Controller for the main page and for serving the file directories
(reference images, generated outputs) that live outside Flask's static
folder.

Two frontends are served side by side while the new React design
(design/) is still missing the "Керування" screens the old one covers
(generation, editing, history):
  - "/"     the new React app — design/dist, built with `npm run
            build`. It's client-side routed (React Router), so any
            path this controller doesn't otherwise recognize falls
            back to the same index.html and the router picks the
            right screen once it loads.
  - "/old"  the previous hand-written interface (views/templates,
            views/static) — untouched, still the only place actual
            generation/editing/history work happens today.
"""

import container
from flask import Blueprint, abort, render_template, send_from_directory
from models import generate_designs as engine

pages_bp = Blueprint("pages", __name__)

REACT_DIST = container.BASE / "design" / "dist"

# Path segments already owned by something other than the React SPA —
# the fallback route below must 404 on these instead of silently
# handing back index.html for a mistyped /api/... call or a missing
# asset.
_RESERVED_PREFIXES = {"api", "refs", "outputs", "assets", "static", "old"}


@pages_bp.get("/old")
def old_index():
    return render_template("index.html")


@pages_bp.get("/refs/<path:name>")
def serve_ref(name):
    return send_from_directory(engine.REFS_DIR.resolve(), name)


@pages_bp.get("/outputs/<path:name>")
def serve_output(name):
    return send_from_directory(engine.OUT_DIR.resolve(), name)


@pages_bp.get("/")
def index():
    return send_from_directory(REACT_DIST, "index.html")


@pages_bp.get("/favicon.svg")
def react_favicon():
    return send_from_directory(REACT_DIST, "favicon.svg")


@pages_bp.get("/assets/<path:filename>")
def react_assets(filename):
    return send_from_directory(REACT_DIST / "assets", filename)


@pages_bp.get("/<path:path>")
def spa_fallback(path):
    if path.split("/", 1)[0] in _RESERVED_PREFIXES:
        abort(404)
    return send_from_directory(REACT_DIST, "index.html")
