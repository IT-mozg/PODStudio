# -*- coding: utf-8 -*-
"""Controller for app settings (API key, prompt template, OpenAI balance
tracking) and small utility actions (opening the output folder)."""

import os
import subprocess
import sys

from flask import Blueprint, jsonify, request

import container
from models import generate_designs as engine

settings_bp = Blueprint("settings", __name__, url_prefix="/api")


@settings_bp.get("/budget")
def api_budget():
    return jsonify(container.balance_status())


@settings_bp.get("/settings")
def api_settings():
    cfg = container.load_config()
    key = container.get_api_key()
    masked = (key[:7] + "…" + key[-4:]) if len(key) > 14 else ("є" if key else "")
    return jsonify({"api_key_masked": masked,
                    "prompt_template": cfg.get("prompt_template",
                                               engine.PROMPT_TEMPLATE),
                    "default_template": engine.PROMPT_TEMPLATE,
                    "balance": cfg.get("balance")})


@settings_bp.post("/settings")
def api_settings_save():
    data = request.get_json(force=True)

    def mutate(cfg):
        if data.get("api_key"):
            cfg["api_key"] = data["api_key"].strip()
        if "prompt_template" in data:
            tpl = data["prompt_template"].strip()
            if tpl and tpl != engine.PROMPT_TEMPLATE:
                cfg["prompt_template"] = tpl
            else:
                cfg.pop("prompt_template", None)

    container.update_config(mutate)

    if "balance" in data:
        raw = str(data["balance"]).strip()
        if raw:
            try:
                new_balance = float(raw)
            except ValueError:
                new_balance = None
            # Only reset the "spent" counter if the number is genuinely new -
            # otherwise saving any other setting (e.g. the prompt template)
            # would silently zero out spend tracking.
            if new_balance is not None and new_balance != container.load_config().get("balance"):
                container.set_balance(new_balance)
        else:
            container.update_config(lambda cfg: (cfg.pop("balance", None),
                                                 cfg.pop("spent_since_sync", None)))
    return jsonify({"ok": True})


@settings_bp.post("/open-folder")
def api_open_folder():
    path = str(engine.OUT_DIR.resolve())
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", path])
        elif os.name == "nt":
            subprocess.Popen(["explorer", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
