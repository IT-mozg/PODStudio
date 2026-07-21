# -*- coding: utf-8 -*-
"""Controller for the main page and for serving the file directories
(reference images, generated outputs) that live outside Flask's static
folder."""

from flask import Blueprint, render_template, send_from_directory

from models import generate_designs as engine

pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/refs/<path:name>")
def serve_ref(name):
    return send_from_directory(engine.REFS_DIR.resolve(), name)


@pages_bp.get("/outputs/<path:name>")
def serve_output(name):
    return send_from_directory(engine.OUT_DIR.resolve(), name)
