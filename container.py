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
import time
from pathlib import Path

from models import generate_designs as engine
from models.design_generator import OpenAIDesignGenerator
from models.etsy_api_listing_source import EtsyApiListingSource
from models.etsy_api_shop_source import EtsyApiShopSource
from models.generation_queue import GenerationQueue, ReferenceResolver
from models.history_store import HistoryStore
from models.shop_source import Shop
from models.tracked_store import TrackedStore

BASE = Path(__file__).parent.resolve()
os.chdir(BASE)  # keep refs/output/history next to the project root
for _d in (engine.REFS_DIR, engine.OUT_DIR):
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


def get_etsy_api_key() -> str:
    return os.getenv("ETSY_API_KEY", "") or load_config().get("etsy_api_key", "")


def get_etsy_shared_secret() -> str:
    return os.getenv("ETSY_SHARED_SECRET", "") or load_config().get("etsy_shared_secret", "")


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
# This is the only place the program "knows" the concrete listing source
# and the AI provider - controllers and the generation queue only ever
# talk to listing_source (typed as the ListingSource interface), so
# swapping either implementation never touches controller code.

listing_source = EtsyApiListingSource(
    api_key_provider=get_etsy_api_key,
    shared_secret_provider=get_etsy_shared_secret,
    page_size=78,
)
# Shops are a separate port (models/shop_source.py), not a method on the
# listing source - Etsy serves them from different endpoints and they are
# worth caching for a different length of time.
shop_source = EtsyApiShopSource(
    api_key_provider=get_etsy_api_key,
    shared_secret_provider=get_etsy_shared_secret,
)
design_generator = OpenAIDesignGenerator(api_key_provider=get_api_key)

history_store = HistoryStore(engine.HISTORY_FILE)
# Two instances of the same store, one file each: bookmarked listings and
# bookmarked shops are independent lists of opaque ids.
tracked_store = TrackedStore(Path("tracked.json"))
tracked_shops_store = TrackedStore(Path("tracked_shops.json"))
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


def age_months(created_timestamp: int) -> int:
    """Whole months since a listing's original creation date, or 0 if
    created_timestamp isn't available. Floored, not rounded - a 20-day-old
    listing is 0 months old, not 1."""
    if not created_timestamp:
        return 0
    return max(0, int((time.time() - created_timestamp) // 2629800))  # 2629800s = 1 average month


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
    tracked = tracked_store.load()
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
            "shop_id": listing.shop_id,
            "shop_name": listing.shop_name,
            "tags": listing.tags,
            "views": listing.views,
            "age_months": age_months(listing.created_timestamp),
            # Etsy's public API exposes no per-listing sales/revenue figures
            # other than for the authenticated user's own shop - there is no
            # endpoint or field that provides them, so these stay None
            # rather than shipping a made-up number. Estimating them from
            # views x price-based conversion rate is issues #57/#58; see
            # etsy_conversion_research.md for the method.
            "sales": None,
            "revenue": None,
            "tracked": lid in tracked,
        })
    return out


def shops_payload(shops: list[Shop]) -> list:
    """Same job as listings_payload, for shops: domain objects -> the JSON
    shape design/'s shopMapper.ts consumes (snake_case, verbatim)."""
    tracked = tracked_shops_store.load()
    return [{
        "shop_id": shop.shop_id,
        "name": shop.name,
        "listing_count": shop.listing_count,
        "age_months": age_months(shop.created_timestamp),
        # Real, unlike a listing's sales above: transaction_sold_count is
        # public per shop. It counts order line items, not orders (Shop
        # Manager's own "orders" number reads ~10% lower - see
        # etsy_shop_sales_history_research.md).
        "sales": shop.total_sales,
        "review_average": shop.review_average,
        "review_count": shop.review_count,
        "num_favorers": shop.num_favorers,
        "icon_url": shop.icon_url,
        "etsy_url": shop.url or f"https://www.etsy.com/shop/{shop.name}",
        # Deliberately None, each with a ticket - Etsy exposes none of them
        # and no single call can derive them:
        #   revenue -> #80 (sales x average listing price)
        #   growth  -> #81 (needs daily transaction_sold_count snapshots)
        #   niche   -> #82 (most common tag across the shop's listings)
        "revenue": None,
        "growth": None,
        "niche": None,
        "tracked": shop.shop_id in tracked,
    } for shop in shops]
