# -*- coding: utf-8 -*-
"""
Composition root: wires the concrete Model implementations together and
holds small shared config/helper functions. Controllers import shared
service instances from here instead of constructing their own - this is
what lets a Model implementation (e.g. the listing source) be swapped by
changing a single line below, without touching any controller.
"""

import json
import os
import threading
from pathlib import Path

from models import generate_designs as engine
from models.design_generator import OpenAIDesignGenerator
from models.generation_queue import GenerationQueue, ReferenceResolver
from models.history_store import HistoryStore
from models.listing_source import HtmlPageListingSource

BASE = Path(__file__).parent.resolve()
os.chdir(BASE)  # keep pages/refs/output/history next to the project root
for _d in (engine.PAGES_DIR, engine.REFS_DIR, engine.OUT_DIR):
    _d.mkdir(exist_ok=True)

CONFIG_FILE = BASE / "ui_config.json"

COST = {  # rough price per generated image, $
    "gpt-image-2": {"low": 0.03, "medium": 0.07, "high": 0.21},
    "gpt-image-1.5": {"low": 0.02, "medium": 0.05, "high": 0.20},
    "gpt-image-1-mini": {"low": 0.005, "medium": 0.015, "high": 0.05},
}


# ---------------- config ----------------
# One shared lock around read-modify-write of ui_config.json: both settings
# saves and spend tracking (record_spend, called from generation queue
# worker threads) write to the same file.

config_lock = threading.Lock()


def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                           encoding="utf-8")


def update_config(mutate) -> dict:
    """mutate(cfg: dict) -> None, changes cfg in place. Returns the saved cfg."""
    with config_lock:
        cfg = load_config()
        mutate(cfg)
        save_config(cfg)
        return cfg


def get_api_key() -> str:
    return (os.getenv("OPENAI_API_KEY", "")
            or load_config().get("api_key", "")
            or engine.API_KEY)


def base_template() -> str:
    return load_config().get("prompt_template", engine.PROMPT_TEMPLATE)


def build_prompt(title: str, bg: str, template: str = None) -> str:
    tpl = template or base_template()
    return tpl.format(theme=title, background=bg or "{background}")


def set_balance(value: float) -> None:
    """The user manually pastes their current credit balance from
    platform.openai.com/settings/organization/billing - OpenAI does not
    expose this through a regular API key. From this point spend is
    counted from zero again."""
    update_config(lambda cfg: cfg.update(balance=value, spent_since_sync=0.0))


def record_spend(amount: float) -> None:
    update_config(lambda cfg: cfg.update(
        spent_since_sync=cfg.get("spent_since_sync", 0.0) + amount))


def balance_status() -> dict:
    cfg = load_config()
    balance = cfg.get("balance")
    spent = cfg.get("spent_since_sync", 0.0)
    return {
        "balance": balance,
        "spent_since_sync": spent,
        "remaining": (balance - spent) if balance is not None else None,
    }


# ---------------- dependency wiring (composition root) ----------------
# This is the only place the program "knows" that the listing source is
# html files and the generator is OpenAI. To swap in the Etsy API or a
# different AI provider, only these lines need to change.

listing_source = HtmlPageListingSource(engine.PAGES_DIR, parser=engine.parse_page)
design_generator = OpenAIDesignGenerator(api_key_provider=get_api_key)

history_store = HistoryStore(engine.HISTORY_FILE)
reference_resolver = ReferenceResolver(
    get_reference=engine.get_reference,
    shirt_background=engine.shirt_background,
    title_to_filename=engine.title_to_filename,
)


def _on_spend(item: dict) -> None:
    record_spend(COST.get(item["model"], {}).get(item["quality"], 0))


gen_queue = GenerationQueue(
    generator=design_generator,
    listing_source=listing_source,
    history=history_store,
    refs=reference_resolver,
    out_dir=engine.OUT_DIR,
    prompt_builder=build_prompt,
    max_workers=engine.WORKERS,
    max_retries=engine.MAX_RETRIES,
    on_spend=_on_spend,
)


# ---------------- UI helpers ----------------

def ui_thumb(remote: str) -> str:
    """A lighter version of an image for the grid (avoid pulling fullxfull into the browser)."""
    if not remote:
        return ""
    import re
    return re.sub(r"il_(?:\d+x\d+|\d+xN|fullxfull)", "il_570xN", remote)


def effective_bg(lid: str) -> str:
    ref = engine.REFS_DIR / f"{lid}.jpg"
    if ref.exists():
        try:
            return engine.shirt_background(str(ref))
        except Exception:
            return ""
    return ""


def listings_payload(found: dict) -> list:
    history = history_store.load()
    out = []
    for lid, listing in found.items():
        ref_exists = (engine.REFS_DIR / f"{lid}.jpg").exists()
        bg = effective_bg(lid) if ref_exists else ""
        saved_prompt = (history.get(lid) or {}).get("prompt")
        out.append({
            "lid": lid,
            "title": listing.title,
            "thumb": f"/refs/{lid}.jpg" if ref_exists
                     else ui_thumb(listing.remote_img),
            "etsy_url": f"https://www.etsy.com/listing/{lid}",
            "generated": lid in history,
            "background": bg,
            "history": history.get(lid),
            "prompt": saved_prompt or build_prompt(listing.title, bg),
        })
    return out
