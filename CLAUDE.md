# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start-of-session briefing (read this first)

Two codebases: Flask at the repo root (Python) and `design/` (React 19 + TS).
Flask serves the built `design/dist` at `/`, and the old hand-written UI at
`/old`.

| Action | Command |
|---|---|
| Run the app | `python3 app.py` → http://127.0.0.1:8765 |
| Python tests | `python3 -m pytest -q` |
| One test file | `python3 -m pytest tests/test_history_store.py -v` |
| Frontend: types + lint | `cd design && npx tsc -b && npm run lint` |
| Rebuild dist (REQUIRED after any `design/src` change) | `cd design && npm run build`, then commit `dist` |
| Port already taken | `lsof -ti tcp:8765 -sTCP:LISTEN \| xargs -r kill` |
| What CI runs on a PR | `.github/workflows/ci.yml` - pytest, plus lint/build and a **stale-`dist` check** for `design/` |

### What does not exist here - don't go looking for it

- **No frontend test runner.** `vitest` is not in `design/package.json`
  (issue #31 adds it). Do **not** reach for `npx vitest` as a workaround -
  `npx` silently downloads the package from the registry, so the command
  appears to work while testing nothing that is actually installed.
- **No tests for `controllers/`.** Not one. No Flask route tests anywhere.
- **No tests for** `models/etsy_api_listing_source.py`, `halftone.py`,
  `background_removal.py`, `upscale.py`, `etsy_taxonomy.py`.
  `tests/test_etsy_api_shop_source.py` covers the **shop** source, not the
  listing source - an easy and expensive misread.
- **No authentication, roles or sessions.** The app is single-user and bound
  to `127.0.0.1` (`app.py`). Every `/api/*` route is unauthenticated,
  including the ones that write API keys and spend money.
- **No Docker, no migrations, no database.** All state is JSON files.
  There *is* CI now (`.github/workflows/ci.yml`), but it only runs what you
  can run locally - it adds no coverage of its own.
- **`strict` is off** in `design/tsconfig.app.json`. The mappers *read* as
  null-safe and the `Listing`/`Shop` types spell out `| null`, but the
  compiler is not enforcing any of it. Null discipline there is convention
  only - treat every backend field as possibly `null` by hand.

### Workflow

Branches: `feature/*` → `develop`. **Never push or merge to `main`
directly.** Changed `design/src` → `npm run build` → commit `dist`, or Flask
keeps serving the old bundle and the bug you just fixed will look unfixed.

### Deliberately deferred - don't raise these unprompted

- **The editing pipeline** (`models/halftone.py`, `background_removal.py`,
  `upscale.py`) has no tests, and that is a deliberate choice for now, as is
  the missing checksum on the downloaded upscale binary (issue #37). Both
  come back when the management page starts. **Exception:** if this app is
  ever deployed to a network, #37 becomes urgent immediately - an unsigned
  binary would then execute on a server, not on the owner's own Mac.
- **Phase 4 / the manage side** (issues #11-#18, #60-#65) is parked. `/old`
  stays the only place generation works.
- Current focus is the **research side: Listings and Shops**.

## What this repo contains

Two separate things live side by side - don't confuse them:

1. **The production app** (repo root): a local Flask web tool for browsing
   Etsy listings and generating original AI t-shirt designs from them
   (OpenAI `images.edit`), plus a post-processing pipeline (halftone,
   background removal, upscale) on the generated results.
2. **`design/`**: a React 19 + TypeScript + Vite app (own `package.json`,
   own dev server) that is the *intended future* frontend. Flask **does**
   serve it - `controllers/pages_controller.py` puts its built `dist/` at
   `/` and keeps the original hand-written interface at `/old`. Its
   *research* side is now real: `ListingsPage`, `ShopsPage`,
   `ListingDetailPage` and `ShopDetailPage` fetch live Etsy data through
   `httpListingsRepository`/`httpShopsRepository`. Everything else there
   (Dashboard, Keywords, the whole manage side) is still mock-backed, and
   `/old` (`views/templates`, `views/static`) remains the only place
   generation/editing/history actually work.

## Commands

### Production app (Flask, root)

```bash
pip3 install -r requirements.txt
python3 app.py
```
Versions are pinned. If you change `requirements.txt`, **regenerate
`requirements.lock`** with the commands in its own header - CI installs from
the lock, and `scripts/check_requirements_lock.py` fails the build if the two
drift apart. Never hand-edit the lock.

Opens `http://127.0.0.1:8765`. Requires an OpenAI API key and Etsy API
Keystring/Shared Secret entered via the in-app Settings modal (or
`OPENAI_API_KEY` / `ETSY_API_KEY` / `ETSY_SHARED_SECRET` env vars - see
`container.get_api_key`/`get_etsy_api_key`/`get_etsy_shared_secret`).

### Tests

```bash
pip3 install pytest
python3 -m pytest          # config in pytest.ini (adds "." to the path)
```

`tests/` covers **concurrency and resource bounds only** - the things that
are invisible in a single-threaded read of the code and that a manual click
through the UI will not reproduce: the history/config lost-update races, the
atomic-write guarantee, the generation queue's session handling and its
retained-results cap, the LRU cache bounds, and OpenAI client reuse. Nothing
there touches the network or OpenAI - every collaborator is injected, so the
suite is fast and offline. There is deliberately no coverage of the image
pipeline, the Flask routes or the Etsy response parsing yet.

To be blunt about the gap, because it is bigger than that paragraph sounds:
**only `models/` is covered, and only partly.** `controllers/` has zero
tests, `design/` has zero tests and no test runner installed at all. If you
are about to look for either, don't - add them instead.

When adding a test here, make it *fail against the old code first*. Each of
these was written that way, and the failures were real: the lost-update test
kept 1 of 20 history entries, the atomic-write test saw 397 corrupt reads,
and the superseded-batch test ran 6 paid generations where 2 were wanted.

### `design/` (separate Node project - `cd design` first)

```bash
npm run dev      # vite dev server
npm run build     # tsc -b && vite build - Flask serves the resulting dist/ at "/"
npm run lint      # oxlint
npm run preview
```

`npm run build` is not optional if you changed anything under `design/src`
and want to see it at `/` - Flask serves the built `dist/`, not the source.
`dist/` is committed on purpose (see `design/.gitignore`), and **nothing
verifies that it matches `src/`**. A stale bundle is completely invisible:
Flask serves the old code without an error, so the symptom is "my fix did
nothing" and you go debugging a bug that is already fixed. Rebuild and
commit `dist` in the same commit as the `src` change.

## Architecture: production app (MVC)

```
app.py               entry point - creates the Flask app, registers controllers
container.py          composition root - wires concrete Model implementations together
models/               domain logic and data
controllers/          Flask blueprints - HTTP in, calls into models, JSON/template out
views/                templates/index.html, static/style.css, static/js/ (ES modules, no build step)
```

**`container.py` is the one place that "knows" concrete implementations.**
Controllers and the generation queue only ever talk to the shared instances
it exports (`listing_source`, `design_generator`, `gen_queue`,
`history_store`, ...) - swapping an implementation is a one-line change
there, no controller ever needs to change.

**Where this is going: `ARCHITECTURE.md` (ADR-001, #118)** - the agreed
target layering (`domain/`, `application/`, `infrastructure/`,
`interfaces/`, `composition/`), the dependency-direction rule, and a
module-by-module table of where each file lands. Read it before adding a
new module or moving one, and before proposing a DI framework - that
question is closed there.

**None of those directories exist yet.** The structure above (`models/`,
`controllers/`, `container.py`) is the real one until #125 lands, and the
"Where to look, by topic" table below stays the map. `ARCHITECTURE.md`'s
table carries a "current path" column for exactly this reason - use it to
find the file, not to guess a path.

### Concurrency - every shared instance is touched by many threads

`app.run(threaded=True)`, plus `WORKERS` generation threads in
`GenerationQueue`'s executor. Everything `container.py` exports is a
*single instance shared by all of them*, so read this before adding state
to any model:

- **Never read-modify-write a JSON state file in two steps.** Use the
  store's own `update(mutate)` (`HistoryStore`, `container.update_config`)
  or `toggle()` (`TrackedStore`), which hold one lock across
  load→mutate→save. Doing the load outside the lock is exactly the bug that
  cost 19 of 20 history entries when two workers finished together.
- **All writes go through `models/json_store.py`** (`write_json` - temp file
  + `os.replace`). Reads then need no lock at all, which is why
  `load_config()` can stay lock-free on a path called by nearly every
  request. Plain `Path.write_text` truncates first, and every reader here
  swallows `JSONDecodeError`, so a partial read doesn't crash - it silently
  becomes `{}`, i.e. "Немає API-ключа" on a valid key.
- **Caches are bounded** (`models/lru.py`). Both Etsy sources' caches are
  `LruCache`, not dicts; a `Listing` carries its own 2-5 KB description, so
  unbounded ones grew all session. `LruCache` is deliberately *not*
  thread-safe on its own - it always lives behind its owner's lock, which
  is already held across the network call that fills it.
- **`GenerationQueue` carries a session token.** `start_new()` bumps it;
  workers from a superseded batch check it and exit instead of generating.
  Futures already inside the executor cannot be un-submitted, so without
  this a replaced batch kept running - measured at 6 paid generations where
  the user asked for 2. A worker already *inside* `generate()` still
  records its result: the image was paid for, losing it would be worse.
- **Etsy source locks are held across the network call**, on purpose (see
  `EtsyApiListingSource._lock`) - that's what makes N concurrent lookups of
  the same page or shop cost one request against a 5 req/s key, not N.

`tests/` exists to keep all of the above honest - see the Tests section.

### Listing sources - swappable via `ListingSource` interface

The only listing source today is `models/etsy_api_listing_source.py`
(`EtsyApiListingSource`) - live search against the official, documented Etsy
Open API v3 (`https://openapi.etsy.com/v3/application`). No HTML scraping or
browser automation. Personal-access rate limit: 5 req/s, 5000/day; one "page
shown" = 2 calls (id search + one batch image call for all 78 results). Page
depth capped at 40 (`MAX_PAGES`). Several undocumented API quirks (image
URLs, HTML entities in headers) are recorded in this file's docstring, and
the transport-level ones (auth header format, 429 retry) in
`models/etsy_api_client.py` - the HTTP layer both Etsy sources share. Read
both before touching Etsy API calls. The official API
does **not** expose competitor sales/revenue estimates even to Personal
Access keys - only what's already publicly visible on a listing page. See
`etsy_conversion_research.md`, `etsy_keyword_search_volume_research.md` and
`etsy_shop_sales_history_research.md` for reverse-engineered notes on how
third-party tools (eRank, ListingView) estimate per-listing
views/sales/conv-rate, keyword search volume, and a shop's monthly sales
history - none of which Etsy provides via API - read these before
re-deriving that research if a similar estimate feature is ever built here.
The shop-sales file in particular records two *different* working methods
(review histogram vs daily snapshot deltas), each validated against real
Shop Manager order counts, plus the plan for which to use when.

**Two listing payloads, on purpose.** `container.listings_payload()` is the
lean grid shape (78 rows a page); `container.listing_detail_payload()` adds
the heavy per-listing fields - description, price, the full photo array,
category/attributes - and is served only by `GET /api/listings/<int:lid>`.
Merging them would turn a ~40 KB search response into ~300 KB of data the
grid never renders. The extra fields cost **no additional Etsy request**:
they ride along in the `/listings/batch` response the source already makes,
so opening a listing the user just searched is served straight from
`_page_cache`. `models/etsy_taxonomy.py` (`container.taxonomy`) turns a
listing's bare `taxonomy_id` into a readable category path - one 365 KB
`/seller-taxonomy/nodes` call cached for the whole process, and a failure
there yields `""`/"—" rather than breaking the page.

`models/fx_rates.py` (`container.fx_rates`) is reference data of the same
kind, but *not* an Etsy call: ECB daily rates via Frankfurter, so a price can
be converted to USD. It exists because the price→conversion-rate table in
`etsy_conversion_research.md` is denominated in dollars and is a **step
function** ($19.99→2.27%, $20.00→2.07%), while listings are priced in
EUR/GBP/PLN too - looking a raw price up in that table would put a 45 PLN
listing (~$11.82) in the $45 bucket. Cached a day in `fx_rates.json`
(gitignored); an unreachable service serves stale rates indefinitely rather
than none, and an empty cache yields `None`, never a 1:1 fallback. Two things
the docs don't tell you are recorded in its docstring: `rates` is *units per
USD* (converting to dollars is a division), and Cloudflare 403s urllib's
default User-Agent. Nothing consumes it yet - #57 will.

`container.listing_source` is just this `EtsyApiListingSource` instance -
controllers/the generation queue talk to it only through the
`ListingSource` interface, so adding a second source back = one new
`ListingSource` subclass + one line in `container.py`, no controller
changes. A second source (`HtmlPageListingSource` + `CompositeListingSource`,
manually-saved `.html` pages) predated the API key and was removed - see git
history if you need it. The CLI entry point in `models/generate_designs.py`
still reads `.html` files from `pages/` the same way.

### Shop source - `ShopSource` interface, separate from listings

`models/shop_source.py` (`ShopSource`, `Shop`) +
`models/etsy_api_shop_source.py` (`EtsyApiShopSource`), exposed as
`container.shop_source` and served by `controllers/shops_controller.py`
(`GET /api/shops?query=`, `GET /api/shops/tracked`,
`GET /api/shops/<id>`, `POST /api/shops/<id>/track`). Deliberately its own
port rather than methods on `ListingSource`: different endpoints, different
caching lifetime (shop records are cached for the whole process, search
pages are not).

**Read `EtsyApiShopSource`'s docstring before touching shop search** - the
API's limits shape the whole feature: `GET /shops` *requires* `shop_name`
(there is no way to list shops, and no sort parameter at all), matching is
Etsy's own fuzzy match, and there is no shop batch endpoint, so N shops
cost N requests. Because Etsy offers no ranking, the source imposes its own
(exact name match -> prefix matches -> the rest, by lifetime sales), and
`ShopsPage` keeps that order as its resting state.

What a shop *does* expose is real: `transaction_sold_count` (lifetime
sales - unlike a listing, where sales are unavailable), `review_count`,
`review_average`, `listing_active_count`, `created_timestamp`,
`num_favorers`. What it never exposes, each `None` in
`container.shops_payload()` with a ticket attached: revenue (#80), growth
over time (#81 - needs the daily snapshots from Epic I), niche (#82).
Don't "fill them in" with a plausible number without reading those.

Bookmarked shops persist in `tracked_shops.json` via a second
`TrackedStore` instance (`container.tracked_shops_store`) - the same class
listings use, with its own file.

### Generation pipeline

`models/generation_queue.py` (`GenerationQueue`) queues design-generation
jobs, with retries and per-listing-id dedup, calling
`models/design_generator.py`'s `OpenAIDesignGenerator` (OpenAI
`images.edit`) and writing to `models/history_store.py` (`history.json`
persistence). `models/generate_designs.py` holds lower-level utilities
(HTML parsing, reference image handling, shirt-background compositing,
the prompt template) plus a standalone CLI entry point. Cost-per-image
estimates live in `container.COST`, keyed by model+quality; spend is
tracked in `ui_config.json` against a manually-entered OpenAI balance
(`container.set_balance`/`record_spend`/`balance_status` - OpenAI doesn't
expose live balance via a regular API key).

### Post-generation editing pipeline (`controllers/editing_controller.py`)

Ports of a Photoshop/Illustrator workflow (`POD_Halftone_Mask.jsx` +
Gigapixel + Upscayl) applied to already-generated images in `output/`:

- `models/halftone.py` - sketch/halftone mask generation (Python port of
  the .jsx script).
- `models/background_removal.py` - a deterministic flood-fill cutout from
  the four image corners, standing in for Photoshop's Select Subject. Not
  a general saliency model on purpose - see the module docstring for why
  a saliency model (rembg/u2net) performs worse on this app's specific
  output (flat-background AI-generated illustrations, sometimes
  multi-object).
- `models/upscale.py` - shells out to the `realesrgan-ncnn-vulkan` binary
  (the engine behind Upscayl), downloaded on first use into
  `vendor/realesrgan/` (gitignored). **macOS only** (needs Vulkan via
  MoltenVK).

## Architecture: `design/`

Served by Flask at `/`. The four research pages (`ListingsPage`,
`ListingDetailPage`, `ShopsPage`, `ShopDetailPage`) are on real data;
every other page is still mock-backed. Deliberate patterns (discussed and
confirmed with the project owner):

- **Dependency injection via interface + default-parameter props.** Pages
  depend on a repository *interface* (`ShopsRepository`,
  `ListingsRepository`, `KeywordsRepository`), injected as a default
  parameter - and that seam is what the API wiring actually used: all four
  live pages default to `httpListingsRepository`/`httpShopsRepository`,
  with zero changes to any table or presentational component along the way.
  The mock repositories are still exported and still compile against the
  interface (they are what #31's first DI test will inject), but nothing
  injects them today. No DI container - unnecessary at this scale.
- **Backend shape stays in the mapper.** `listingMapper.ts`/`shopMapper.ts`
  are the only files that know Flask's snake_case JSON; everything above
  them sees the camelCase `Listing`/`Shop` types. Fields Etsy has no data
  for arrive as `null` and are rendered as "—" (never `0`, which would read
  as a real zero) - see `formatCount`/`formatRevenue` in `shared/money.ts`.
  Money that *is* real goes through `formatPrice`, which keeps the listing's
  own `currency_code` - Etsy listings are not all in USD.
- **Nothing without a real source is rendered as a fact.** Both detail pages
  used to synthesize most of their content with a seeded PRNG
  (`mulberry32`), so an invented Listing Score, keyword volume or shop
  conversion rate was indistinguishable from measured data. Neither does
  now (`listingDetail.ts` deleted in #78, `shopDetail.ts` in #8): every
  block Etsy can't back shows "—"/an empty state plus a
  `shared/components/TodoBadge` linking to the issue that will fill it in.
  Listing side: #84 score, #85 SEO checks, #86 similar listings, #87
  monthly views, #56 tag volume/KD, #57/#58 sales & conversion. Shop side:
  #80 revenue, #49 the monthly sales chart, #82 niche, plus #91 listings /
  #92 reviews / #93 category & handmade / #94 conversion, whose numbers are
  kept in `pages/shops/shopTodoIssues.ts` rather than inline in the JSX.
  When closing one of those, delete its badge *and* its `previewData.ts`
  constant - don't leave either pointing at finished work.
- **Preview blocks, not fallbacks.** Where a whole section has no data, its
  body renders `NoDataNotice` with a `preview` of hand-written constants
  from `previewData.ts` (one per feature slice), dimmed behind a "Приклад —
  не реальні дані" ribbon and made inert. That keeps the intended design
  visible while the feature waits, without a single number that could be
  read as measured. Components rendered in bulk (`ListingsTable`,
  `RatingBars`, `BarTrendChart`, `BarBreakdown`) deliberately have *no*
  empty-state branch of their own - they live in `shared/`, and giving them
  one would make the shared kernel import a feature's preview data.
- **One fetch helper, one error path.** `shared/api.ts` (`apiFetch`,
  `ApiError`, `describeError`) is the only place that talks HTTP; it reads
  the response as text before parsing, so Flask's HTML 404/500 pages produce
  an actionable message instead of a `SyntaxError`, and a controller's own
  `{"error": ...}` always wins. Pages render that message through
  `shared/components/ErrorNotice` - never `catch(console.error)` alone,
  which used to make a stale Flask process, a missing Etsy key and a genuine
  empty result look identical ("Знайдено: 0").
- **Filters sort client-side** (`listingFilters.ts`, `shopFilters.ts`) -
  neither Flask nor Etsy has a sort parameter, so a chip click must never
  cost a network round trip. Chips whose data doesn't exist yet render
  `disabled` with a tooltip rather than silently sorting by something else.
- **Feature-based (vertical slice) folders** under `src/pages/*`
  (`dashboard/`, `listings/`, `shops/`, `keywords/`, `calculator/`) - each
  owns its own types, repository, and components, not split across global
  `components/`/`services/`/`types/` layers.
- **Shared kernel** in `src/shared/components/`, `src/shared/hooks/` for
  anything ≥2 features use.
- **Container/Presentational split** on detail pages: `*DetailPage`
  (container - fetches via repository, owns loading/error state) hands
  plain props to `*DetailView` (presentational, pure props-in/JSX-out).
- **No global store on purpose** (no Redux/Zustand/Context) - every
  page's state is local or round-trips through its own repository.
- **Selective `React.memo`** - only on components rendered in bulk inside
  table rows (`StarToggleButton`, `Pill`, `*Table`), not on
  single-instance-per-page components.

Real architectural work deliberately deferred until specific trigger
conditions are met (a real API is wired up, row counts grow past mock
size, etc.) - if extending this app, check with the project owner whether
one of those triggers has been hit before adding things like list
virtualization, a global store, or an Atomic Design reorg.

## What's gitignored (never commit)

`ui_config.json` (OpenAI/Etsy API keys + balance), `history.json`
(personal generation history), `tracked.json`/`tracked_shops.json`
(personal bookmarks), `pages/*` (manually-saved Etsy HTML -
copyrighted third-party content), `refs/` (downloaded competitor
reference images), `output/` (generated results), `vendor/` (the
downloaded upscale binary/model weights).

## Where to look, by topic

Go straight to these. Reading around them is the single biggest waste of a
session here.

| Topic | Files - and don't read past them |
|---|---|
| Etsy transport, retries, rate limits | `models/etsy_api_client.py` (84 lines) - read the **docstring**, not the code |
| Listing search, page cache, quirks | `models/etsy_api_listing_source.py` - 508 lines. Read the docstring plus the one method you need. **Never the whole file.** |
| Shops | `models/etsy_api_shop_source.py` + `models/shop_source.py` |
| Payload shapes (the Python↔TS contract) | `container.py` → `listings_payload`, `listing_detail_payload`, `shops_payload` |
| Persistence | `models/json_store.py` + `history_store.py` + `tracked_store.py` (159 lines total) |
| Money and generation | `models/generation_queue.py` + `design_generator.py` + `container.COST` |
| Listings UI | `design/src/pages/listings/` - `listingMapper.ts`, `listingFilters.ts`, `types.ts` |
| Shops UI | `design/src/pages/shops/` - `ShopDetailView.tsx` is 353 lines, read a range |
| "Why isn't this number real?" | `etsy_conversion_research.md`, `etsy_keyword_search_volume_research.md`, `etsy_shop_sales_history_research.md` - **the named section only**; these are 8-14 KB each |

## Context rules

**Never read in full:**

- `design/dist/**` - a built bundle. Unreadable and huge.
- `output/`, `refs/`, `pages/` - binaries and saved third-party HTML.
- `history.json`, `ui_config.json`, `tracked*.json` - runtime state, and
  `ui_config.json` holds API keys. Need the shape? Read the store, not the
  file.
- `design/src/shared/icons.tsx` (251 lines) - SVG path data, not logic.
- The three `*_research.md` files - the named section only.

**Grep first, then read a range.** For anything over ~200 lines
(`etsy_api_listing_source.py` 508, `ShopDetailView.tsx` 353,
`generation_queue.py` 266), find the line and read ±40 around it.

**Docstrings beat code.** `etsy_api_client.py`, `etsy_api_shop_source.py`,
`background_removal.py` and `lru.py` all carry docstrings written precisely
so nobody has to read the implementation. Read them and stop there.

**Trust the tests as the spec.** `tests/` states the concurrency guarantees
more precisely than the code does. Reading a test is cheaper than deriving
the same rule from the implementation.

**Budget: 6 files read per ticket.** Needing more means the ticket is too
big - say so instead of pulling the whole repo into context.
