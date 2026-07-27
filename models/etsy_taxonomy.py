# -*- coding: utf-8 -*-
"""
Resolves Etsy's numeric taxonomy_id into a human-readable category path.

A listing carries only `taxonomy_id: 482`, never a category name. The name
comes from a separate endpoint, GET /seller-taxonomy/nodes - and that
endpoint is unusual enough to deserve its own module rather than a method on
EtsyApiListingSource: it describes the *marketplace*, not any one listing.

STATUS: verified against a real "Personal Access" key on 2026-07-27.

  1. The endpoint takes no parameters and returns the ENTIRE seller taxonomy
     in one response - 15 top-level nodes, ~3,065 nodes in total, ~365 KB.
     There is no "look up one id" variant, so the only sane strategy is to
     fetch it once and index it in memory.
  2. Nodes nest via a "children" list, but each node also carries
     `full_path_taxonomy_ids` - the ids from the root down to itself. That
     is what makes a readable path cheap: flatten the tree once into
     {id: name}, then join the ids of that list.
     Live example: 482 -> [374, 465, 478, 482] ->
     "Clothing > Gender-Neutral Adult Clothing > Tops & Tees > T-shirts".
  3. The taxonomy changes on Etsy's schedule (a few times a year at most),
     so a process-lifetime cache is right - the same reasoning as
     EtsyApiShopSource's shop cache. Restart the app to refresh.

Failure is never fatal here: a category name is decoration on a detail page,
not the reason the page exists. Any error (no API key, rate limit, unknown
id) yields "" and the UI renders "—" - it must not turn a working listing
page into a 502.
"""

import threading

from .etsy_api_client import API_BASE, EtsyApiClient, EtsyApiError

SEPARATOR = " → "


class EtsyTaxonomy:
    """Lazily-loaded, process-lifetime index of Etsy's seller taxonomy."""

    def __init__(self, client: EtsyApiClient):
        self._client = client
        self._lock = threading.RLock()
        self._names: dict[int, str] | None = None  # None = not loaded yet
        self._paths: dict[int, list[int]] = {}
        # Set once the first attempt fails, so a missing/invalid API key
        # doesn't mean a 365 KB request on every single detail page view.
        # Cleared by reload() if the caller ever wants to retry.
        self._failed = False

    def path_name(self, taxonomy_id: int) -> str:
        """Full category path for a taxonomy id, e.g.
        "Clothing → Tops & Tees → T-shirts". Empty string when the id is
        unknown, falsy, or the taxonomy could not be fetched."""
        if not taxonomy_id:
            return ""
        # Both maps come out of _load() as one snapshot: reading self._paths
        # separately afterwards could see it already cleared by a concurrent
        # reload() while `names` still held the old index.
        names, paths = self._load()
        if not names:
            return ""
        path = paths.get(int(taxonomy_id))
        if not path:
            # Etsy knows the id but didn't give a path (or we don't know the
            # id at all) - fall back to the node's own name if we have it.
            return names.get(int(taxonomy_id), "")
        return SEPARATOR.join(names[i] for i in path if i in names)

    def reload(self) -> None:
        """Drop the cache so the next lookup re-fetches. Used after new Etsy
        credentials are saved in Settings - the first attempt may well have
        failed precisely because there was no key yet."""
        with self._lock:
            self._names = None
            self._paths = {}
            self._failed = False

    # ---------------- internals ----------------

    def _load(self) -> tuple[dict[int, str], dict[int, list[int]]]:
        """The (names, paths) pair, fetching it once. Returned together as a
        consistent snapshot - callers must not read the attributes directly,
        since reload() can swap them between two reads."""
        with self._lock:
            if self._names is not None:
                return self._names, self._paths
            if self._failed:
                return {}, {}
            try:
                data = self._client.get(f"{API_BASE}/seller-taxonomy/nodes")
            except EtsyApiError:
                # Deliberately swallowed: see the module docstring. The
                # listing itself is still perfectly renderable without a
                # category name.
                self._failed = True
                return {}, {}

            names: dict[int, str] = {}
            paths: dict[int, list[int]] = {}
            for node in self._walk(data.get("results") or []):
                node_id = node.get("id")
                if not node_id:
                    continue
                names[node_id] = node.get("name") or ""
                paths[node_id] = node.get("full_path_taxonomy_ids") or [node_id]
            self._names = names
            self._paths = paths
            return names, paths

    @classmethod
    def _walk(cls, nodes: list):
        """Depth-first over the nested "children" lists."""
        for node in nodes:
            yield node
            yield from cls._walk(node.get("children") or [])
