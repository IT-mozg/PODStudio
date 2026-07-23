# -*- coding: utf-8 -*-
"""
Design generation queue.

The single responsibility of this class is orchestration (queueing,
statuses, retries, writing to history). It knows nothing about Flask, nor
about how listings are actually fetched (ListingSource) or how an image is
actually generated (DesignGenerator) - those dependencies are passed into
the constructor (dependency inversion), so swapping the listing source or
the generation provider requires no changes here.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Callable

from .design_generator import DesignGenerator
from .history_store import HistoryStore
from .listing_source import ListingSource


@dataclass
class ReferenceResolver:
    """Responsible only for where to get the reference image and its
    background from. Kept separate because this is a file-handling detail
    (generate_designs.*), not part of queue orchestration."""
    get_reference: Callable[[str, dict], str]
    shirt_background: Callable[[str], str]
    title_to_filename: Callable[[str], str]


class GenerationQueue:
    def __init__(self, generator: DesignGenerator, listing_source: ListingSource,
                 history: HistoryStore, refs: ReferenceResolver,
                 out_dir: Path, prompt_builder: Callable[[str, str], str],
                 max_workers: int, max_retries: int,
                 on_spend: Callable[[dict], None] = None):
        self._generator = generator
        self._listing_source = listing_source
        self._history = history
        self._refs = refs
        self._out_dir = out_dir
        self._prompt_builder = prompt_builder
        self._max_retries = max_retries
        self._on_spend = on_spend
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._lock = threading.Lock()
        # Results are keyed by lid (not a plain list!) so that regenerating
        # an already-shown listing updates its own block instead of adding
        # a duplicate. total/done/ok/fail are derived on the fly from item
        # statuses, so they can never drift out of sync with reality.
        self._items: dict[str, dict] = {}
        self._order: list[str] = []
        self._running = False
        self._stop = False

    # ---------------- public API ----------------

    def status(self) -> dict:
        with self._lock:
            items = [self._items[lid] for lid in self._order]
            running, stop = self._running, self._stop
        return {
            "running": running,
            "stop": stop,
            "total": len(items),
            "done": sum(1 for i in items if i["status"] in ("ok", "fail")),
            "ok": sum(1 for i in items if i["status"] == "ok"),
            "fail": sum(1 for i in items if i["status"] == "fail"),
            "items": items,
        }

    def request_stop(self) -> None:
        with self._lock:
            self._stop = True

    def enqueue(self, items: list[dict]) -> str:
        """Adds items to the current results session - whether it is still
        running or has just finished. Never clears previous results (for a
        single regeneration from "Results"/"History" this is exactly what
        is needed - the list should not disappear). If a lid is already in
        the list, its existing block is updated in place instead of adding
        a duplicate. To explicitly start a fresh session, use start_new()."""
        with self._lock:
            was_running = self._running
            to_run = []
            for item in items:
                lid = item["lid"]
                if lid in self._items:
                    slot = self._items[lid]
                    slot.clear()
                    slot.update(item)
                else:
                    slot = item
                    self._items[lid] = slot
                    self._order.append(lid)
                to_run.append(slot)
            self._running = True
            self._stop = False
            result = "queued" if was_running else "started"
        for slot in to_run:
            self._executor.submit(self._run_one, slot)
        return result

    def start_new(self, items: list[dict]) -> str:
        """Explicitly clears the previous results session and starts a new
        one - used for a batch generation from the "Listings" tab (that is
        exactly when the user expects to see a clean results list)."""
        with self._lock:
            self._items = {}
            self._order = []
            for item in items:
                self._items[item["lid"]] = item
                self._order.append(item["lid"])
            self._running = True
            self._stop = False
        for item in items:
            self._executor.submit(self._run_one, item)
        return "started"

    # ---------------- internal ----------------

    def _run_one(self, item: dict) -> None:
        with self._lock:
            item["status"] = "run"
        try:
            self._process(item)
        except Exception as e:  # noqa: BLE001
            with self._lock:
                item.update(status="fail", error=str(e)[:200])
        finally:
            with self._lock:
                if all(i["status"] in ("ok", "fail") for i in self._items.values()):
                    self._running = False

    def _is_stopped(self) -> bool:
        with self._lock:
            return self._stop

    def _resolve_reference(self, item: dict) -> str:
        lid = item["lid"]
        source = item.get("source", "ref")
        if source == "result" and item.get("prev_file") and Path(item["prev_file"]).exists():
            return item["prev_file"]
        # get_by_ids([lid]), not get_all() - this runs once per queued item,
        # each in its own worker thread; get_all() here used to mean N
        # selected listings fanned out into N concurrent full-catalog
        # fetches. get_by_ids() checks the page cache first, so this is a
        # zero-network-call lookup whenever the listing was already shown
        # on a browsed page (the common case).
        listings = self._listing_source.get_by_ids([lid])
        listing = listings.get(lid)
        info = {"title": listing.title if listing else item["title"],
                "local_img": listing.local_img if listing else "",
                "remote_img": listing.remote_img if listing else ""}
        return self._refs.get_reference(lid, info)

    def _process(self, item: dict) -> None:
        lid = item["lid"]
        ref_path = self._resolve_reference(item)
        if not ref_path:
            raise RuntimeError("немає референсної картинки")

        bg = self._refs.shirt_background(ref_path)
        prompt = item.get("prompt") or self._prompt_builder(item["title"], bg)
        prompt = prompt.replace("{background}", bg)

        out_path = item.get("out_path") or str(
            self._out_dir / self._refs.title_to_filename(item["title"]))

        last_err = None
        for attempt in range(1, self._max_retries + 1):
            if self._is_stopped():
                raise RuntimeError("зупинено")
            try:
                data = self._generator.generate(ref_path, prompt, item["model"], item["quality"])
                Path(out_path).write_bytes(data)
                last_err = None
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(15 * attempt)
        if last_err:
            raise last_err

        history = self._history.load()
        entry = {"title": item["title"], "date": date.today().isoformat(),
                 "file": out_path, "background": bg,
                 "model": item["model"], "quality": item["quality"]}
        if item.get("prompt"):
            entry["prompt"] = item["prompt"]
        elif lid in history and history[lid].get("prompt"):
            entry["prompt"] = history[lid]["prompt"]
        with self._lock:
            history[lid] = entry
            self._history.save(history)
            item.update(status="ok", background=bg, out_file=Path(out_path).name)
        if self._on_spend:
            self._on_spend(item)
