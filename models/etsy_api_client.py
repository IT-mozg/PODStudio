# -*- coding: utf-8 -*-
"""
Shared HTTP layer for the official Etsy Open API v3.

Extracted from EtsyApiListingSource (where it used to live as a private
_get) once a second caller appeared - EtsyApiShopSource. Everything here is
about *talking to Etsy*, nothing about listings or shops: auth header,
timeouts, the 429 retry, and the single error type callers translate into an
HTTP 502.

Two things the docs don't make obvious, found by testing directly (kept here
because they belong to the transport, not to any one endpoint):

  1. The x-api-key header must be "{keystring}:{shared_secret}", not just
     the keystring alone - a bare keystring gets a 403
     ("Shared secret is required in x-api-key header").
  2. The personal-access key is capped at 5 requests/second, so a burst of
     UI actions can trip a 429 within the same second - hence the short
     retry below (429 only; anything else fails immediately).

Credentials are passed as callables, not plain strings, so they are read
fresh from settings on every request - saving new Etsy credentials in
Settings takes effect immediately, no restart.
"""

import json
import time
import urllib.error
import urllib.request
from typing import Callable

from . import generate_designs as _gd

API_BASE = "https://openapi.etsy.com/v3/application"
TIMEOUT = 15
RATE_LIMIT_RETRIES = 3


class EtsyApiError(RuntimeError):
    """The Etsy API returned an error (bad key, rate limit, etc.).

    `status` carries Etsy's HTTP status code where there was one (None for a
    missing key or an unreachable host), so a caller can tell "this shop id
    does not exist" (404) from "something is broken" without parsing the
    message text."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class EtsyApiClient:
    """Thin, stateless GET client for the Etsy API.

    Stateless on purpose: caching is the *source's* job (a page of listings
    and a shop record have completely different lifetimes), so nothing here
    remembers responses."""

    def __init__(self, api_key_provider: Callable[[], str],
                 shared_secret_provider: Callable[[], str]):
        self._api_key_provider = api_key_provider
        self._shared_secret_provider = shared_secret_provider

    def get(self, url: str) -> dict:
        api_key = self._api_key_provider()
        shared_secret = self._shared_secret_provider()
        if not api_key or not shared_secret:
            raise EtsyApiError(
                "Немає Etsy API-ключа/shared secret. Додай їх у налаштуваннях "
                "(іконка шестерні вгорі).")
        auth_header = f"{api_key}:{shared_secret}"
        req = urllib.request.Request(url, headers={"x-api-key": auth_header})
        for attempt in range(1, RATE_LIMIT_RETRIES + 1):
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT, context=_gd.SSL_CTX) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                if e.code == 429 and attempt < RATE_LIMIT_RETRIES:
                    time.sleep(attempt)  # 1s, then 2s
                    continue
                raise EtsyApiError(f"Etsy API {e.code}: {body[:300]}", status=e.code) from e
            except urllib.error.URLError as e:
                raise EtsyApiError(f"Could not reach the Etsy API: {e}") from e
