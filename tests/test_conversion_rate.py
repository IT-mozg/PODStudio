# -*- coding: utf-8 -*-
"""models/conversion_rate.py - the bucket lookup, and the two things about it
that a glance at the table will not tell you.

The centrepiece is test_confirmed_boundaries: the whole reason this is a
bracket table instead of a formula is that $19.99 and $20.00 return
different values, one cent apart. Those two transitions (and the $34.99 /
$35.00 pair) are the only *measured* evidence for the shape of the whole
thing, so they get asserted as exact pairs. Change the lookup to "nearest
bucket" or "next bucket up" - both perfectly reasonable-looking readings of
a table of price points - and only this test notices.

The rest guard the honesty rule: a price this module cannot make sense of
has to become None, never 0.0. A zero conversion rate renders as a claim
about the listing ("it converts at 0%") rather than as an admission that we
do not know, and that is precisely the class of number this project refuses
to display.

Pure function, no collaborators, no I/O - nothing to inject."""

import math

import pytest

from models.conversion_rate import _BUCKETS, conv_rate_pct, est_sales


# ---- the measured evidence ----

@pytest.mark.parametrize("below, above, rate_below, rate_above", [
    # Both pairs come from etsy_conversion_research.md, where they were
    # observed directly. They are what proves this is a step function.
    (19.99, 20.00, 2.27, 2.07),
    (34.99, 35.00, 1.61, 1.38),
])
def test_confirmed_boundaries(below, above, rate_below, rate_above):
    """A one-cent step across a threshold changes the rate, and each side
    matches the value actually observed there."""
    assert conv_rate_pct(below) == rate_below
    assert conv_rate_pct(above) == rate_above


def test_a_bucket_value_applies_from_its_own_threshold_upward():
    """Not "nearest point" and not "next point up" - the rate at $20.00
    holds all the way to $24.99, and only then drops."""
    assert conv_rate_pct(20.00) == 2.07
    assert conv_rate_pct(22.50) == 2.07
    assert conv_rate_pct(24.99) == 2.07
    assert conv_rate_pct(25.00) == 1.98


@pytest.mark.parametrize("price, expected", [
    # One assertion per confirmed band from the research file's "Real
    # observed data points" table, at both of its ends where known.
    (10.00, 2.51), (14.99, 2.51),
    (15.99, 2.27), (18.99, 2.27),
    (40.00, 1.31), (44.99, 1.31),
    (45.00, 1.15), (49.98, 1.15),
    (50.00, 1.07), (54.99, 1.07),
    (55.00, 0.98), (59.99, 0.98),
])
def test_confirmed_bands(price, expected):
    assert conv_rate_pct(price) == expected


def test_hundred_dollars_and_up_is_a_flat_floor():
    """The one part of the model confirmed as a hard rule rather than a
    fitted curve: it stops falling at $100 and stays at 0.50%."""
    assert conv_rate_pct(100.00) == 0.50
    assert conv_rate_pct(250.00) == 0.50
    assert conv_rate_pct(9999.99) == 0.50


def test_cheapest_bucket_covers_prices_under_a_dollar():
    """Etsy's minimum is $0.20, and the table starts at 0 - a 30-cent
    listing gets the top rate, not None."""
    assert conv_rate_pct(0.20) == 5.16
    assert conv_rate_pct(0.99) == 5.16
    assert conv_rate_pct(1.99) == 5.16


# ---- honest degradation: None, never 0.0 ----

@pytest.mark.parametrize("bad", [
    None,
    0,             # missing price upstream, not a free listing
    0.0,
    -1.0,          # nonsense, but arithmetic on a bad divisor can produce it
    float("nan"),  # json.loads parses bare NaN/Infinity by default
    float("inf"),
    float("-inf"),
    True,          # bool is a subclass of int; would otherwise price at $1
    "19.99",       # a string that *looks* numeric is still not a number
    [20.0],
])
def test_unusable_price_yields_none_not_zero(bad):
    result = conv_rate_pct(bad)
    assert result is None, f"{bad!r} produced {result!r}"


def test_no_input_ever_produces_a_zero_rate():
    """Belt and braces on the rule above: 0.0 must not be reachable as a
    *rate* for any price, because it is indistinguishable from a real
    measurement of zero."""
    for price in (0.01, 0.2, 1, 5, 19.99, 20, 99.99, 100, 1_000_000):
        assert conv_rate_pct(price) != 0.0


# ---- the table itself ----

def test_table_is_ascending_and_starts_at_zero():
    """A threshold out of order would silently shadow its neighbours: the
    lookup walks the table in order and stops at the first threshold above
    the price, so an unsorted row is simply never reached."""
    thresholds = [t for t, _ in _BUCKETS]
    assert thresholds == sorted(thresholds)
    assert len(thresholds) == len(set(thresholds)), "duplicate threshold"
    assert thresholds[0] == 0.0, "a price below the first threshold has no bucket"


def test_every_rate_is_a_plausible_percentage():
    """Guards against a typo turning 2.07 into 207 (a fraction/percent mixup
    is the classic one here) or into a negative."""
    for threshold, rate in _BUCKETS:
        assert math.isfinite(rate), f"{threshold}: {rate}"
        assert 0.0 < rate <= 100.0, f"{threshold}: {rate}"


def test_rates_never_increase_with_price():
    """The whole model is "cheaper converts better". A bucket that pays more
    than a cheaper one would be a data-entry error, not a discovery -
    the two equal pairs ($70/$75 and $85/$90) are in the file on purpose."""
    rates = [r for _, r in _BUCKETS]
    for lower, higher in zip(rates, rates[1:]):
        assert higher <= lower, f"rate rises from {lower} to {higher}"


# ---- est_sales: round(views * rate / 100) ----

def test_est_sales_is_views_times_the_rate():
    """The one formula here that is measured rather than modelled: it
    reproduced eRank's own Est. Sales on 19 of 19 listings. 10 000 views at
    $19.00 (2.27%) is 227 sales."""
    assert est_sales(10_000, 19.00) == 227


def test_est_sales_rounds_rather_than_truncates():
    """1 234 x 2.27% = 28.0118 -> 28, and 1 000 x 2.51% = 25.1 -> 25.
    Truncation would quietly under-report every listing."""
    assert est_sales(1_234, 19.00) == 28
    assert est_sales(1_000, 12.00) == 25


def test_est_sales_follows_the_price_step():
    """A one-cent price change moves the estimate, because the rate it
    multiplies by is a step function - same view count, different answer."""
    assert est_sales(10_000, 19.99) == 227
    assert est_sales(10_000, 20.00) == 207


def test_est_sales_is_none_when_the_price_is_unusable():
    """No price, no rate, no estimate. None rather than 0: "sold nothing" is
    a claim about the listing that this function has no basis for. Callers
    that display a 0 anyway have to substitute it themselves."""
    for price in (None, 0, -5.0, float("nan"), float("inf"), "19.00", True):
        assert est_sales(10_000, price) is None, price


def test_est_sales_is_none_when_views_are_unusable():
    for views in (None, -1, float("nan"), float("inf"), "1000", True):
        assert est_sales(views, 19.00) is None, views


def test_zero_views_is_a_real_zero():
    """Unlike a missing price, 0 views is a fact Etsy reported - a listing
    nobody has opened really has sold nothing, so this 0 is honest."""
    assert est_sales(0, 19.00) == 0
