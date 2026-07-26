# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo contains

Two separate things live side by side - don't confuse them:

1. **The production app** (repo root): a local Flask web tool for browsing
   Etsy listings and generating original AI t-shirt designs from them
   (OpenAI `images.edit`), plus a post-processing pipeline (halftone,
   background removal, upscale) on the generated results.
2. **`design/`**: a design/prototyping sandbox, not wired to the Flask
   backend at all.
   - `design/react-app/` - a React 19 + TypeScript + Vite mock UI (own
     `package.json`, own dev server) used to explore a possible future
     frontend, currently running entirely on mock repositories.
   - `design/mockups/` - static HTML mockups.

## Commands

### Production app (Flask, root)

```bash
pip3 install flask openai beautifulsoup4 pillow numpy scipy
python3 app.py
```
Opens `http://127.0.0.1:8765`. Requires an OpenAI API key and Etsy API
Keystring/Shared Secret entered via the in-app Settings modal (or
`OPENAI_API_KEY` / `ETSY_API_KEY` / `ETSY_SHARED_SECRET` env vars - see
`container.get_api_key`/`get_etsy_api_key`/`get_etsy_shared_secret`).

There is no automated test suite for this app yet.

### `design/react-app/` (separate Node project - `cd design/react-app` first)

```bash
npm run dev      # vite dev server
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview
```

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

### Listing sources - swappable via `ListingSource` interface

The app supports **two listing sources at once**, switchable live in the UI
(tabs above the search bar), both wrapped by
`models/listing_source_registry.py`'s `CompositeListingSource` so
controllers/the generation queue always talk to one object regardless of
which is active (`GET/POST /api/sources` switches it):

- `models/etsy_api_listing_source.py` (`EtsyApiListingSource`) - live
  search against the official, documented Etsy Open API v3
  (`https://openapi.etsy.com/v3/application`). No HTML scraping or browser
  automation. Personal-access rate limit: 5 req/s, 5000/day; one "page
  shown" = 2 calls (id search + one batch image call for all 78 results).
  Page depth capped at 40 (`MAX_PAGES`). Several undocumented API quirks
  (auth header format, image URLs, HTML entities in headers) are recorded
  in this file's docstring - read it before touching Etsy API calls.
  The official API does **not** expose competitor sales/revenue estimates
  even to Personal Access keys - only what's already publicly visible on a
  listing page. See `etsy_conversion_research.md` and
  `etsy_keyword_search_volume_research.md` for reverse-engineered notes on
  how third-party tools (eRank etc.) estimate views/sales/conv-rate and
  keyword search volume that Etsy itself doesn't provide via API - read
  these before re-deriving that research if a similar estimate feature is
  ever built here.
- `HtmlPageListingSource` (in `models/listing_source.py`) - parses
  `.html` files the user manually saves from the browser into `pages/`
  (drag-and-drop in the "Збережені сторінки" tab). Predates the Etsy API
  key; kept because it can show things live search can't (a competitor's
  full shop, "favorites") and works if the API is down. A live-browser
  (Playwright) scraping approach was tried and removed - too unstable
  against Etsy's DataDome bot protection.

Adding a third source = one new `ListingSource` subclass + one line
registering it in `container.py` - no controller changes.

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

## Architecture: `design/react-app/`

Mock-data-only exploratory UI - no calls to the Flask backend. Deliberate
patterns (discussed and confirmed with the project owner):

- **Dependency injection via interface + default-parameter props.** Pages
  depend on a repository *interface* (`ShopsRepository`,
  `ListingsRepository`, `KeywordsRepository`); the mock implementation is
  injected as a default parameter, e.g.
  `ShopsPage({ repository = mockShopsRepository })`. Swapping in a real
  API-backed repository later touches zero page components. No DI
  container - unnecessary at this scale.
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
(personal generation history), `pages/*` (manually-saved Etsy HTML -
copyrighted third-party content), `refs/` (downloaded competitor
reference images), `output/` (generated results), `vendor/` (the
downloaded upscale binary/model weights).
