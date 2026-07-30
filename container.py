# -*- coding: utf-8 -*-
"""
Composition root: wires the concrete Model implementations together and
holds small shared config/helper functions. Controllers import shared
service instances from here instead of constructing their own - this is
what lets a Model implementation (e.g. the listing source) be swapped by
changing a single line below, without touching any controller.
"""

import os
import threading
import time
from pathlib import Path

from models import generate_designs as engine
from models import json_store
from models.conversion_rate import conv_rate_pct, est_sales
from models.design_generator import OpenAIDesignGenerator
from models.etsy_api_client import EtsyApiClient
from models.etsy_api_listing_source import EtsyApiListingSource
from models.etsy_api_shop_source import EtsyApiShopSource
from models.etsy_taxonomy import EtsyTaxonomy
from models.fx_rates import FxRates
from models.generation_queue import GenerationQueue, ReferenceResolver
from models.history_store import HistoryStore
from models.shop_source import SalesHistory, Shop
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
#
# load_config() itself stays lock-free on purpose - it is called on nearly
# every request (get_api_key, get_etsy_api_key, balance_status...) and the
# atomic write below is what makes that safe: a reader sees either the whole
# old file or the whole new one. Before that, a reader could land inside
# write_text's truncate-then-write window, get a JSONDecodeError, fall back
# to {} and report "Немає API-ключа" on a perfectly good key.

config_lock = threading.Lock()


def load_config() -> dict:
    return json_store.read_json(CONFIG_FILE, {})


def save_config(cfg: dict):
    json_store.write_json(CONFIG_FILE, cfg)


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
# Marketplace-wide reference data, not a listing/shop port: turns a listing's
# bare taxonomy_id into a readable category path. Its own client instance
# because it belongs to neither source.
taxonomy = EtsyTaxonomy(EtsyApiClient(get_etsy_api_key, get_etsy_shared_secret))
# Same category as taxonomy: marketplace-independent reference data, not a
# listing or shop port. Needed because the price -> conversion-rate table
# (etsy_conversion_research.md) is denominated in dollars while listings are
# priced in EUR/GBP/PLN too - see #99, consumed by #57. Nothing reads it yet.
# Not an Etsy call at all, so it takes no Etsy credentials and counts against
# no Etsy rate limit.
fx_rates = FxRates(BASE / "fx_rates.json")
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


def age_months(created_timestamp: int) -> int | None:
    """Whole months since the original creation date, floored - a 20-day-old
    listing is 0 months old, not 1.

    None, not 0, when Etsy gave no creation date: 0 has to keep meaning
    "really is under a month old". Collapsing the two made a dateless
    listing's lifetime views render as its monthly rate (#87)."""
    if not created_timestamp:
        return None
    return max(0, int((time.time() - created_timestamp) // 2629800))  # 2629800s = 1 average month


SIMILAR_QUERY_CHARS = 50
SIMILAR_QUERY_MIN_WORDS = 3


def similar_query(title: str) -> str:
    """The search query used to find listings similar to this one (#86).

    Etsy publishes no similar/recommended endpoint, so "similar" is a second
    relevance search, and the query is the opening of the title - roughly the
    part a shopper actually sees in Etsy's own search results, and the part
    sellers front-load with their real keywords.

    Words are never cut and never dropped: the word that crosses the
    SIMILAR_QUERY_CHARS boundary is taken whole, so the query can run a little
    past 50 characters. A truncated word ("vintag") would search for something
    that isn't a word, and dropping it would throw away the term the seller
    put there on purpose."""
    words = title.split()
    if not words:
        return ""
    out = [words[0]]
    length = len(words[0])
    for word in words[1:]:
        if length >= SIMILAR_QUERY_CHARS:
            break
        length += 1 + len(word)
        out.append(word)
    return " ".join(out)


def similar_query_ladder(title: str) -> list[str]:
    """similar_query() plus progressively shorter fallbacks, widest last.

    Measured against the live API, not assumed: Etsy's `keywords` behaves as
    an AND over the terms, so the full 50-character opening of a real title
    ("Legend Since 1961 T Shirt - Soft Cotton T-Shirt or") matched exactly
    one listing - itself. The same title cut to its first three words matched
    ten. A carousel that is empty on nearly every listing is not a feature,
    so the caller walks this ladder and keeps the first rung that fills.

    The 50-character query stays rung one - it is the most specific and gives
    the best cards when it does match - and the caller reports back whichever
    rung actually produced the results, so the UI never claims a narrower
    criterion than the one it used. Three rungs at most: each costs 2 Etsy
    requests against a 5 req/s key, and below three words the query stops
    describing the listing at all."""
    words = similar_query(title).split()
    if not words:
        return []
    counts = [len(words), max(SIMILAR_QUERY_MIN_WORDS, len(words) // 2),
              SIMILAR_QUERY_MIN_WORDS]
    ladder = []
    for n in counts:
        query = " ".join(words[:n])
        if query and query not in ladder:
            ladder.append(query)
    return ladder


def effective_bg(lid: str) -> str:
    ref = engine.REFS_DIR / f"{lid}.jpg"
    if ref.exists():
        try:
            return engine.shirt_background(str(ref))
        except Exception:
            return ""
    return ""


def listing_price_usd(listing) -> float | None:
    """A listing's price in USD, or None if it can't be established.

    Two independent ways to get None, both of which must stay None rather
    than becoming a number: the listing has no price at all, or the FX
    service has never been reachable and the rate cache is empty (see
    models/fx_rates.py). A 1:1 fallback would be indistinguishable from a
    real conversion for a USD listing and silently wrong for every other."""
    if listing.price_amount is None or not listing.price_divisor:
        return None
    return fx_rates.to_usd(listing.price_amount / listing.price_divisor,
                           listing.price_currency)


def listings_payload(found: dict) -> list:
    history = history_store.load()
    tracked = tracked_store.load()
    out = []
    for lid, listing in found.items():
        ref_exists = (engine.REFS_DIR / f"{lid}.jpg").exists()
        sales_est = est_sales(listing.views, listing_price_usd(listing))
        unit_price = (listing.price_amount / listing.price_divisor
                      if listing.price_amount is not None and listing.price_divisor
                      else None)
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
            # Not Etsy figures - the model from models/conversion_rate.py
            # (#57/#58). The 0 where it returns None is the project owner's
            # call, not an honest zero.
            "sales": sales_est if sales_est is not None else 0,
            "revenue": (round(sales_est * unit_price, 2)
                        if sales_est is not None and unit_price is not None
                        else 0),
            # Revenue is in the listing's own currency; the USD conversion
            # only serves the dollar-denominated rate table.
            "revenue_currency": listing.price_currency,
            "tracked": lid in tracked,
        })
    return out


def listing_detail_payload(listing) -> dict:
    """Everything listings_payload() gives for one listing, plus the heavy
    detail-only fields (description, price, the full photo set, attributes).

    Split from listings_payload() on purpose rather than merged into it: a
    search page carries 78 rows, and a description alone runs 2-5 KB, so
    folding these in would turn a ~40 KB grid response into ~300 KB for data
    the grid never renders. Costs no extra Etsy request either way - the
    fields ride along in the same /listings/batch response the source
    already makes (see EtsyApiListingSource's docstring, note 4).

    Fields Etsy genuinely has no value for arrive as None/[] and are rendered
    as "—" by design/'s mapper - never as 0 or an invented default."""
    base = listings_payload({listing.lid: listing})[0]
    base.update({
        "description": listing.description,
        # Raw money, not a formatted string: the frontend needs the currency
        # to format it (listings exist in EUR/GBP/PLN, not just USD).
        "price_amount": listing.price_amount,
        "price_divisor": listing.price_divisor,
        "price_currency": listing.price_currency,
        # All photos, in Etsy's own rank order. listings_payload's "thumb"
        # stays as-is (it can point at a locally-saved reference image).
        "photos": [ui_thumb(url) for url in listing.images],
        # Canonical URL as Etsy reports it - more reliable than the one
        # listings_payload builds from the id, since Etsy includes the slug.
        "etsy_url": listing.url or base["etsy_url"],
        # Attributes. category_path is "" when the taxonomy lookup is
        # unavailable; materials/style are frequently [] even on complete
        # listings. Both render as "—".
        "category_path": taxonomy.path_name(listing.taxonomy_id),
        "who_made": listing.who_made,
        "when_made": listing.when_made,
        "materials": listing.materials,
        "style": listing.style,
        "processing_min": listing.processing_min,
        "processing_max": listing.processing_max,
        "is_personalizable": listing.is_personalizable,
        "has_variations": listing.has_variations,
        # The only public per-listing demand signal Etsy exposes. Real, so it
        # is a number rather than the None that sales/revenue are.
        "num_favorers": listing.num_favorers,
        # NOT an Etsy figure - Etsy publishes no conversion rate for anyone
        # but a shop's own owner. This is the reverse-engineered price-bucket
        # model from models/conversion_rate.py, converted to USD first
        # because the buckets are dollar-denominated (#99 -> #57). None when
        # the price or the FX rate is missing; the UI labels it as an
        # estimate rather than passing it off as measured data. Detail only -
        # listings_payload deliberately does not carry it (#57's scope).
        "conv_rate_pct": conv_rate_pct(listing_price_usd(listing)),
        "production_partners": listing.production_partners,
    })
    return base


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


def sales_history_payload(history: SalesHistory) -> dict:
    """A shop's estimated monthly sales -> the JSON shape shopMapper.ts reads.

    Its own payload rather than fields on shops_payload above: a search
    returns up to 100 shops and this costs up to 15 Etsy requests per shop
    the first time it is asked for on a given day,
    so it is served only by the detail page's own route.

    `month` stays machine-readable ("2026-03") - the Ukrainian label is the
    frontend's job, like every other piece of formatting here. `known: false`
    means "no data for this month", and the UI must not render it as 0."""
    return {
        "shop_id": history.shop_id,
        # Named so a second method (daily snapshots, #46) can be told apart
        # from this one by whoever reads the response.
        "method": "reviews",
        "ratio": round(history.ratio, 2),
        "months": [{
            "month": month.month,
            "sales": month.sales,
            "known": month.known,
        } for month in history.months],
    }
