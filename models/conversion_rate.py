# -*- coding: utf-8 -*-
"""
Estimated conversion rate for a listing, looked up by price bucket.

**Etsy does not publish this number at all** - not in the API, not on the
listing page, not for anyone but the shop's own owner. Everything here is
reverse-engineered from eRank's public UI and recorded in
etsy_conversion_research.md. Nothing in this module is measured data from
Etsy, and no caller should present it as such.

Two findings from that research shape the whole implementation:

  1. **Only price matters.** The same 2.27% showed up at $19.00 across
     custom t-shirts, body oil, copper bottles, mouse pads, psychic
     readings and Disney magnets. Niche, shop age, favourites and listing
     age all had zero effect, so this function takes exactly one argument.

  2. **It is a step function, not a curve.** Two boundary tests settle it:
     $19.99 -> 2.27% but $20.00 -> 2.07%, and $34.99 -> 1.61% but
     $35.00 -> 1.38%. A one-cent difference flips the value, which can only
     come from a bracket table. The curve-fit formulas in the research file
     are *our* approximation used to fill unmeasured gaps - they are not
     eRank's logic, and smoothing this table with them would erase the very
     jumps that prove what it is.

Each bucket's rate applies from its own threshold up to the next one:
[15, 20) -> 2.27%, [20, 25) -> 2.07%. Both boundary tests above land
exactly where that rule puts them.

The price must already be in **USD** - the buckets are dollar-denominated
while listings are priced in EUR/GBP/PLN too. Converting is
models/fx_rates.py's job (issue #99); handing this function a raw 45 PLN
would put a ~$11.82 listing in the $45 bucket and return 1.15% where 2.51%
was right. See container.listing_detail_payload for the wiring.

Provenance of the numbers, because it is uneven and matters: the `REAL`
rows below were confirmed against an actual listing, the `model` rows were
filled in from the curve fits. One known conflict, resolved by the project
owner in favour of the consolidated table: the research file also records
$1-$4.99 as a single *measured* band at 5.16%, which disagrees with the
modelled 4.21/3.73/3.42 at $2/$3/$4 here. The two rows marked `model †`
($75, $85) are the least reliable in the table - their segment is anchored
on only four points, and both land suspiciously close to their neighbours.
"""

import math

# (lower bound in USD, conversion rate in %) - ascending, contiguous, with
# no gaps: every price >= 0 falls into exactly one bucket. Source marker per
# row is deliberate documentation, not decoration: it tells the next person
# which thresholds were measured and which were fitted, so nobody "corrects"
# a confirmed one from a formula.
_BUCKETS: tuple[tuple[float, float], ...] = (
    (0.0, 5.16),      # REAL  (see the docstring's note on $1-$4.99)
    (2.0, 4.21),      # model
    (3.0, 3.73),      # model
    (4.0, 3.42),      # model
    (5.0, 3.31),      # REAL
    (6.0, 3.03),      # model
    (7.0, 2.90),      # model
    (8.0, 2.78),      # model
    (9.0, 2.69),      # model
    (10.0, 2.51),     # REAL  - confirmed band $10.00-14.99
    (15.0, 2.27),     # REAL  - confirmed $15.99 and $18.99-19.99
    (20.0, 2.07),     # REAL  - confirmed $20.00 and $22.00-22.50
    (25.0, 1.98),     # model - interpolated between real $22.50 and $28.00
    (30.0, 1.61),     # REAL  - confirmed $30.00 and $34.99
    (35.0, 1.38),     # REAL
    (40.0, 1.31),     # REAL  - confirmed $40.00 and $44.99
    (45.0, 1.15),     # REAL  - confirmed $45.00 and $49.98
    (50.0, 1.07),     # REAL  - confirmed band $50.00-54.99
    (55.0, 0.98),     # REAL  - confirmed band $55.00-59.99
    (60.0, 0.92),     # model
    (65.0, 0.86),     # model
    (70.0, 0.76),     # REAL
    (75.0, 0.76),     # model † least reliable
    (80.0, 0.71),     # REAL
    (85.0, 0.68),     # model † least reliable
    (90.0, 0.68),     # REAL
    (95.0, 0.62),     # model
    (100.0, 0.50),    # REAL  - hard floor, flat from $100 up
)


def conv_rate_pct(price_usd) -> float | None:
    """Estimated conversion rate in percent for a listing priced
    `price_usd` dollars, or None when no honest answer exists.

    None - never 0.0 - for a missing, negative, non-finite or non-numeric
    price. A zero rate would render as a real "this converts at 0%", which
    is a claim about the listing rather than an admission that we don't
    know. Zero itself is treated the same way: Etsy's own minimum listing
    price is $0.20, so a 0.00 arriving here means the price is missing
    upstream, not that the listing is free.
    """
    # bool is a subclass of int, and True would otherwise be priced at $1.
    if isinstance(price_usd, bool) or not isinstance(price_usd, (int, float)):
        return None
    if not math.isfinite(price_usd) or price_usd <= 0:
        return None

    rate = None
    for threshold, bucket_rate in _BUCKETS:
        if price_usd < threshold:
            break
        rate = bucket_rate
    return rate


def est_sales(views, price_usd) -> int | None:
    """`round(views * conv_rate_pct(price_usd) / 100)`, or None when either
    input is unusable.

    Lifetime, like Etsy's own view count - not sales in any recent window.
    The formula matched eRank on 19 of 19 listings; the rate it multiplies
    by is still the model described above. None rather than 0 for the same
    reason conv_rate_pct returns None.
    """
    rate = conv_rate_pct(price_usd)
    if rate is None:
        return None
    if isinstance(views, bool) or not isinstance(views, (int, float)):
        return None
    if not math.isfinite(views) or views < 0:
        return None
    return round(views * rate / 100)
