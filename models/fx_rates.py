# -*- coding: utf-8 -*-
"""
Currency conversion to USD, for anything that has to reason about a listing's
price on a common scale.

Why this exists at all: the price -> conversion-rate table in
etsy_conversion_research.md is denominated in **dollars**, and it is a step
function, not a curve - $19.99 buys 2.27% while $20.00 buys 2.07%, one cent
apart. But Etsy listings are not all in USD (EUR/GBP/PLN are common), so
looking a raw price up in that table would put a 45 PLN listing (~$11.82) in
the $45 bucket and hand back 1.15% where 2.51% was right. Not a rounding
error - a systematically wrong number wearing the costume of an estimate.
Hence: convert first, look up second (issues #99 -> #57).

Source: Frankfurter (https://frankfurter.dev), which republishes the European
Central Bank's daily reference rates. Picked over the alternatives because it
needs no API key, imposes no quota, allows commercial use, and lets USD be the
base directly - the raw ECB XML is EUR-based only and would need a cross-rate
computed by hand. exchangerate.host was rejected: since 2023 it requires an
API key *and* a card on file.

Two things about the response that are easy to get backwards:

  1. `rates` is **units of that currency per 1 USD** ("PLN": 3.8062 means one
     dollar buys 3.8 zloty). Converting *to* dollars is therefore a
     division, not a multiplication. rate() below flips it once, so callers
     never have to think about the direction.
  2. The old host api.frankfurter.app now answers 301; the live one is
     api.frankfurter.dev/v1/.

What this module will never do is invent a rate. An unknown currency, or an
empty cache with the network down, yields None - which the UI renders as
"—". A silent 1:1 fallback would be indistinguishable from a real conversion
and would quietly corrupt every downstream estimate.
"""

import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from . import generate_designs as _gd
from . import json_store

API_URL = "https://api.frankfurter.dev/v1/latest?base=USD"
TIMEOUT = 15

# Frankfurter sits behind Cloudflare, which answers urllib's default
# "Python-urllib/3.12" with a 403 - the same request from curl succeeds. Found
# the hard way: the module silently produced None for every currency until the
# fetcher was called directly. Any ordinary UA string gets through; this one
# also says who is calling.
USER_AGENT = "POD-Studio (https://github.com/IT-mozg/PODStudio)"

# The ECB publishes once per working day, so anything more frequent than
# daily is pure waste.
TTL_SECONDS = 24 * 60 * 60

# How long to sit still after a failed fetch before trying again.
#
# This is not politeness, it is the difference between working and hanging:
# _refresh() runs while holding the lock (see below), so without a cooldown a
# machine that is simply offline would pay the full 15-second timeout on
# *every* call, with every other thread queued behind it. Ten minutes of
# stale-but-served rates beats a page that takes a quarter of a minute to
# render.
RETRY_COOLDOWN_SECONDS = 10 * 60


def _fetch_frankfurter() -> dict:
    """Raw parsed response of the latest-rates endpoint. Raises on anything
    that isn't a usable USD-based quote."""
    req = urllib.request.Request(API_URL, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=_gd.SSL_CTX) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    rates = payload.get("rates")
    if not isinstance(rates, dict) or not rates:
        raise ValueError(f"Frankfurter returned no rates: {str(payload)[:200]}")
    # Guard against ever being handed a differently-based quote: every rate
    # below is interpreted as "per 1 USD", and silently accepting a EUR-based
    # response would make every conversion wrong by ~14% without any error.
    if payload.get("base") != "USD":
        raise ValueError(f"Frankfurter returned base={payload.get('base')!r}, expected USD")
    return payload


class FxRates:
    """Exchange rates against USD, cached on disk and refreshed at most daily.

    One shared instance lives in container.py, touched by every Flask thread
    and by the generation queue's workers, so the concurrency rules from
    CLAUDE.md apply in full:

      - The lock is held **across the network call**, deliberately - the same
        trade-off EtsyApiListingSource._lock makes. It means N threads that
        all need a rate at once cost one request to Frankfurter, not N.
      - The cache file is never read-modify-written in two steps: the whole
        load -> refresh -> save sequence happens inside that one lock, and the
        write goes through json_store.write_json (temp file + os.replace), so
        a concurrent reader can never catch a half-written file.
      - Rates are a plain dict rather than an LruCache: this is ~30
        string->float pairs of fixed size, not the unbounded growth that
        models/lru.py exists to bound.

    `fetcher` and `clock` are injected so the tests can run offline and
    without sleeping - the same reason the Etsy sources take their
    credentials as callables."""

    def __init__(self, cache_path: Path,
                 fetcher: Callable[[], dict] | None = None,
                 ttl_seconds: float = TTL_SECONDS,
                 clock: Callable[[], float] = time.time):
        self._cache_path = Path(cache_path)
        self._fetch = fetcher or _fetch_frankfurter
        self._ttl = ttl_seconds
        self._now = clock
        self._lock = threading.Lock()

        # None means "haven't looked at the disk yet", as distinct from {},
        # which means "looked, and there is nothing there".
        self._rates: dict[str, float] | None = None
        self._fetched_at = 0.0
        self._date = ""
        self._retry_not_before = 0.0
        # Why the last refresh failed, for status(). Swallowing the exception
        # is right - a broken rate service must not break a page - but
        # swallowing it *without a trace* is not: this module spent its first
        # live run returning None for every currency because Cloudflare was
        # answering 403, and nothing anywhere said so.
        self._last_error = ""

    # ---- public API ----

    def rate(self, currency: str) -> float | None:
        """How many USD one unit of `currency` is worth, or None if that
        cannot be established honestly.

        None means exactly that - not 1.0. A caller that treats a missing
        rate as parity turns "we don't know" into a confident wrong number."""
        code = (currency or "").strip().upper()
        if not code:
            return None
        # Answered without the lock, the network, or even the cache file: the
        # overwhelmingly common case must not depend on an outside service
        # being reachable.
        if code == "USD":
            return 1.0

        with self._lock:
            self._ensure_fresh()
            per_usd = (self._rates or {}).get(code)

        # `per_usd <= 0` should be impossible, but it is the one value that
        # would turn the division below into a crash or a nonsense rate.
        if not isinstance(per_usd, (int, float)) or per_usd <= 0:
            return None
        return 1.0 / float(per_usd)

    def to_usd(self, amount: float | None, currency: str) -> float | None:
        """`amount`, expressed in `currency`, converted to USD - or None if
        either the amount or the rate is unavailable."""
        if amount is None:
            return None
        r = self.rate(currency)
        return None if r is None else float(amount) * r

    def status(self) -> dict:
        """What the module currently knows, for diagnostics: which day's ECB
        quote is loaded, how many currencies, and when it was fetched. Cheap
        enough to call from a health endpoint."""
        with self._lock:
            self._load_cache_if_needed()
            return {
                "date": self._date,
                "fetched_at": self._fetched_at,
                "currencies": len(self._rates or {}),
                "age_seconds": (self._now() - self._fetched_at) if self._fetched_at else None,
                "last_error": self._last_error,
            }

    # ---- internals (all called with self._lock held) ----

    def _load_cache_if_needed(self) -> None:
        if self._rates is not None:
            return
        cached = json_store.read_json(self._cache_path, {})
        rates = cached.get("rates") if isinstance(cached, dict) else None
        if isinstance(rates, dict):
            self._rates = {str(k).upper(): v for k, v in rates.items()}
            self._fetched_at = float(cached.get("fetched_at") or 0.0)
            self._date = str(cached.get("date") or "")
        else:
            self._rates = {}

    def _ensure_fresh(self) -> None:
        self._load_cache_if_needed()

        now = self._now()
        if self._rates and (now - self._fetched_at) < self._ttl:
            return
        if now < self._retry_not_before:
            return

        try:
            payload = self._fetch()
            rates = {str(k).upper(): float(v) for k, v in payload["rates"].items()}
        except Exception as e:
            # Deliberately broad, and deliberately silent about the old data:
            # whatever went wrong out there - no network, a 500, malformed
            # JSON - the rates already in hand are still the best available
            # answer, and they are NOT overwritten or cleared. An empty cache
            # simply stays empty, and every rate() then returns None. The
            # reason is kept for status() rather than discarded.
            self._last_error = f"{type(e).__name__}: {e}"
            self._retry_not_before = now + RETRY_COOLDOWN_SECONDS
            return

        self._rates = rates
        self._fetched_at = now
        self._date = str(payload.get("date") or "")
        self._retry_not_before = 0.0
        self._last_error = ""
        self._save_cache()

    def _save_cache(self) -> None:
        try:
            json_store.write_json(self._cache_path, {
                "base": "USD",
                "date": self._date,
                "fetched_at": self._fetched_at,
                # Stored exactly as Frankfurter sends them - units per USD.
                # Pre-flipping here would make the file disagree with the API
                # it was copied from, for no gain.
                "rates": self._rates,
            })
        except OSError:
            # An unwritable cache file costs an extra request tomorrow; it is
            # not a reason to fail a conversion that already succeeded.
            pass
