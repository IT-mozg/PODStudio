# -*- coding: utf-8 -*-
"""models/fx_rates.py - the parts that are invisible in a single-threaded read.

Two of these guard properties that no amount of clicking would surface:

  test_concurrent_callers_cost_one_fetch is why the lock is held across the
  network call at all. Without that (lock only around the dict, fetch
  outside), 20 threads asking for a rate at the same moment produce 20
  requests to Frankfurter instead of 1 - the same bug shape the Etsy sources
  avoid the same way. It fails against a released-lock implementation.

  test_failed_fetch_is_not_retried_immediately is the one that keeps an
  offline machine usable. _refresh() runs while holding the lock, so without
  the cooldown every single call pays the full 15s timeout with every other
  thread queued behind it - a page that renders in a quarter of a minute,
  serialized. Remove RETRY_COOLDOWN_SECONDS and this test hangs on the call
  count instead of the clock.

Everything is injected (fetcher, clock), so the suite stays offline and
instant."""

import threading

import pytest

from models.fx_rates import FxRates

# Real shape of GET https://api.frankfurter.dev/v1/latest?base=USD, trimmed.
# Note the direction: these are units per 1 USD, so 45 PLN is 45/3.8062 USD.
SAMPLE = {
    "amount": 1.0,
    "base": "USD",
    "date": "2026-07-28",
    "rates": {"AUD": 1.435, "CAD": 1.4108, "EUR": 0.87974, "GBP": 0.75262, "PLN": 3.8062},
}


class FakeClock:
    def __init__(self, now: float = 1_000_000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


class CountingFetcher:
    """Returns SAMPLE and counts calls; optionally fails or blocks first."""

    def __init__(self, payload=None, fail_with: Exception | None = None,
                 gate: threading.Event | None = None):
        self.payload = payload if payload is not None else SAMPLE
        self.fail_with = fail_with
        self.gate = gate
        self.calls = 0
        self._lock = threading.Lock()

    def __call__(self) -> dict:
        with self._lock:
            self.calls += 1
        if self.gate is not None:
            self.gate.wait(timeout=5)
        if self.fail_with is not None:
            raise self.fail_with
        return self.payload


def make(tmp_path, **kwargs) -> tuple[FxRates, CountingFetcher, FakeClock]:
    fetcher = kwargs.pop("fetcher", None) or CountingFetcher()
    clock = kwargs.pop("clock", None) or FakeClock()
    fx = FxRates(tmp_path / "fx_rates.json", fetcher=fetcher, clock=clock, **kwargs)
    return fx, fetcher, clock


# ---- the common case must not depend on anything external ----

def test_usd_needs_no_network_and_no_cache(tmp_path):
    fx, fetcher, _ = make(tmp_path)
    assert fx.rate("USD") == 1.0
    assert fx.to_usd(10, "USD") == 10.0
    assert fetcher.calls == 0, "USD must never trigger a fetch"
    assert not (tmp_path / "fx_rates.json").exists()


def test_currency_code_is_normalised(tmp_path):
    fx, _, _ = make(tmp_path)
    assert fx.rate(" usd ") == 1.0
    assert fx.rate("pln") == pytest.approx(fx.rate("PLN"))


# ---- conversion direction: the thing that is easy to get backwards ----

def test_converts_by_dividing_not_multiplying(tmp_path):
    fx, _, _ = make(tmp_path)
    # 45 PLN at 3.8062 PLN per USD is ~$11.82. Multiplying instead would give
    # $171 and put the listing in a wholly different conversion-rate bucket -
    # exactly the failure this module exists to prevent.
    assert fx.to_usd(45.00, "PLN") == pytest.approx(11.823, abs=0.001)
    assert fx.to_usd(20.00, "EUR") == pytest.approx(22.734, abs=0.001)


def test_amount_none_is_none(tmp_path):
    fx, fetcher, _ = make(tmp_path)
    assert fx.to_usd(None, "EUR") is None


# ---- "we don't know" must never become a number ----

def test_unknown_currency_is_none_not_parity(tmp_path):
    fx, _, _ = make(tmp_path)
    assert fx.rate("XYZ") is None
    assert fx.to_usd(50, "XYZ") is None, "a missing rate must not fall back to 1:1"


def test_blank_currency_is_none(tmp_path):
    fx, _, _ = make(tmp_path)
    assert fx.rate("") is None
    assert fx.rate(None) is None


def test_failed_fetch_with_empty_cache_is_none(tmp_path):
    fetcher = CountingFetcher(fail_with=OSError("no network"))
    fx, _, _ = make(tmp_path, fetcher=fetcher)
    assert fx.rate("EUR") is None
    assert fx.to_usd(20, "EUR") is None


def test_non_usd_base_is_rejected(tmp_path):
    """A EUR-based response would make every conversion wrong by ~14% with no
    error anywhere, so the fetcher's own validation must reject it. Here the
    module-level guard is bypassed (fetcher is injected), so this checks the
    other half: a payload without usable rates yields None, not garbage."""
    fetcher = CountingFetcher(payload={"base": "EUR", "rates": {}})
    fx, _, _ = make(tmp_path, fetcher=fetcher)
    assert fx.rate("PLN") is None


# ---- caching ----

def test_second_call_does_not_refetch(tmp_path):
    fx, fetcher, _ = make(tmp_path)
    fx.rate("EUR")
    fx.rate("GBP")
    fx.rate("PLN")
    assert fetcher.calls == 1


def test_fresh_cache_on_disk_avoids_the_network_entirely(tmp_path):
    fx, fetcher, clock = make(tmp_path)
    assert fx.rate("EUR") is not None
    assert fetcher.calls == 1

    # A brand new instance, same file, same day: the disk must be enough.
    second_fetcher = CountingFetcher()
    fresh = FxRates(tmp_path / "fx_rates.json", fetcher=second_fetcher, clock=clock)
    assert fresh.rate("EUR") == pytest.approx(fx.rate("EUR"))
    assert second_fetcher.calls == 0


def test_expired_cache_is_refreshed(tmp_path):
    fx, fetcher, clock = make(tmp_path)
    fx.rate("EUR")
    assert fetcher.calls == 1

    clock.now += 24 * 60 * 60 + 1
    fx.rate("EUR")
    assert fetcher.calls == 2


# ---- degradation: stale beats nothing, and beats hanging ----

def test_stale_rates_survive_a_failed_refresh(tmp_path):
    fx, fetcher, clock = make(tmp_path)
    good = fx.rate("PLN")
    assert good is not None

    fetcher.fail_with = RuntimeError("Frankfurter is down")
    clock.now += 10 * 24 * 60 * 60  # ten days later, still no network

    assert fx.rate("PLN") == pytest.approx(good), "old rates beat no rates"
    # And the failure must not have wiped what was on disk.
    reloaded = FxRates(tmp_path / "fx_rates.json",
                       fetcher=CountingFetcher(fail_with=RuntimeError("still down")),
                       clock=clock)
    assert reloaded.rate("PLN") == pytest.approx(good)


def test_failed_fetch_is_not_retried_immediately(tmp_path):
    """Offline, every call would otherwise pay the full network timeout while
    holding the lock. One attempt, then quiet until the cooldown passes."""
    fetcher = CountingFetcher(fail_with=OSError("no network"))
    fx, _, clock = make(tmp_path, fetcher=fetcher)

    for _ in range(50):
        assert fx.rate("EUR") is None
    assert fetcher.calls == 1, "a down service must not be hammered once per call"

    clock.now += 10 * 60 + 1
    assert fx.rate("EUR") is None
    assert fetcher.calls == 2, "after the cooldown it must try again"


def test_recovery_after_an_outage(tmp_path):
    fetcher = CountingFetcher(fail_with=OSError("no network"))
    fx, _, clock = make(tmp_path, fetcher=fetcher)
    assert fx.rate("EUR") is None

    fetcher.fail_with = None
    clock.now += 10 * 60 + 1
    assert fx.rate("EUR") == pytest.approx(1 / SAMPLE["rates"]["EUR"])


# ---- concurrency ----

def test_concurrent_callers_cost_one_fetch(tmp_path):
    """20 threads that all need a rate at the same instant must produce one
    request, not 20. The gate holds the fetcher inside the call until every
    thread has piled up behind the lock."""
    gate = threading.Event()
    fetcher = CountingFetcher(gate=gate)
    fx, _, _ = make(tmp_path, fetcher=fetcher)

    results: list[float | None] = []
    results_lock = threading.Lock()
    ready = threading.Barrier(21, timeout=10)

    def worker():
        ready.wait()
        value = fx.rate("PLN")
        with results_lock:
            results.append(value)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    ready.wait()
    gate.set()
    for t in threads:
        t.join(timeout=30)

    assert fetcher.calls == 1, f"{fetcher.calls} requests where 1 was wanted"
    assert len(results) == 20
    assert all(r == pytest.approx(1 / SAMPLE["rates"]["PLN"]) for r in results)


def test_cache_file_is_written_atomically(tmp_path):
    """Not a re-test of json_store: this asserts fx_rates actually routes
    through it, rather than doing its own write_text."""
    fx, _, _ = make(tmp_path)
    fx.rate("EUR")
    assert [p.name for p in tmp_path.iterdir()] == ["fx_rates.json"], \
        "a leftover .tmp means the write did not go through json_store"


def test_status_reports_what_is_loaded(tmp_path):
    fx, _, clock = make(tmp_path)
    fx.rate("EUR")
    status = fx.status()
    assert status["date"] == "2026-07-28"
    assert status["currencies"] == len(SAMPLE["rates"])
    assert status["age_seconds"] == 0
    assert status["last_error"] == ""


def test_status_explains_a_failure(tmp_path):
    """Regression for a real one: the first live run returned None for every
    currency because Cloudflare answered 403, and the swallowed exception left
    nothing anywhere to say so. Silent degradation is fine; undiagnosable
    degradation is not."""
    fetcher = CountingFetcher(fail_with=OSError("HTTP Error 403: Forbidden"))
    fx, _, _ = make(tmp_path, fetcher=fetcher)
    assert fx.rate("EUR") is None
    assert "403" in fx.status()["last_error"]


def test_last_error_clears_after_recovery(tmp_path):
    fetcher = CountingFetcher(fail_with=OSError("down"))
    fx, _, clock = make(tmp_path, fetcher=fetcher)
    assert fx.rate("EUR") is None
    assert fx.status()["last_error"]

    fetcher.fail_with = None
    clock.now += 10 * 60 + 1
    assert fx.rate("EUR") is not None
    assert fx.status()["last_error"] == ""
