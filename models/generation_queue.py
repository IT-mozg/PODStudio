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

MAX_RETAINED_ITEMS = 200  # cap on the results list kept in memory. enqueue()
                          # deliberately never clears it (a single regeneration
                          # must not wipe the visible results), so without a cap
                          # it grows for the whole life of the process - and
                          # status() serializes the *entire* list on every poll,
                          # once every 1.6s. Only finished items are evicted.


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
        # Bumped by start_new(). A worker carries the session it was
        # submitted under and abandons its job the moment that no longer
        # matches - see _run_one for why the alternative silently reports
        # "готово" while the previous batch is still spending money.
        self._session = 0

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
                    # Updated where it already sits, not moved to the end -
                    # a regenerate must refresh the block the user is looking
                    # at rather than make the list jump under them.
                    slot = self._items[lid]
                    slot.clear()
                    slot.update(item)
                else:
                    slot = item
                    self._items[lid] = slot
                    self._order.append(lid)
                to_run.append(slot)
            self._trim()
            self._running = True
            self._stop = False
            session = self._session
            result = "queued" if was_running else "started"
        for slot in to_run:
            self._executor.submit(self._run_one, slot, session)
        return result

    def start_new(self, items: list[dict]) -> str:
        """Explicitly clears the previous results session and starts a new
        one - used for a batch generation from the "Listings" tab (that is
        exactly when the user expects to see a clean results list).

        Bumping the session is what makes that safe while an earlier batch is
        still in flight: those workers are already inside the executor and
        cannot be un-submitted, so they check the session and stop."""
        with self._lock:
            self._session += 1
            session = self._session
            self._items = {}
            self._order = []
            for item in items:
                self._items[item["lid"]] = item
                self._order.append(item["lid"])
            self._running = True
            self._stop = False
        for item in items:
            self._executor.submit(self._run_one, item, session)
        return "started"

    # ---------------- internal ----------------

    def _trim(self) -> None:
        """Drop the oldest *finished* items once the retained list exceeds
        MAX_RETAINED_ITEMS. Must be called while holding self._lock.

        Only finished ones: an item still queued or running is about to be
        written to by its worker and is what the progress bar counts, so
        evicting it would both lose the result and leave `running` stuck."""
        while len(self._order) > MAX_RETAINED_ITEMS:
            evictable = next(
                (lid for lid in self._order
                 if self._items[lid].get("status") in ("ok", "fail")), None)
            if evictable is None:
                return  # everything still in flight - nothing safe to drop
            self._order.remove(evictable)
            del self._items[evictable]

    def _run_one(self, item: dict, session: int) -> None:
        if self._session_ended(session):
            return
        with self._lock:
            item["status"] = "run"
        try:
            self._process(item, session)
        except Exception as e:  # noqa: BLE001
            with self._lock:
                item.update(status="fail", error=str(e)[:200])
        finally:
            with self._lock:
                # Guarded on the session: start_new() replaces _items wholesale,
                # so a worker from the previous batch would otherwise evaluate
                # "is everything done?" against the *new* batch and could flip
                # running to False while that batch is still generating - the UI
                # says "готово", images keep being paid for.
                if session == self._session and all(
                        i["status"] in ("ok", "fail") for i in self._items.values()):
                    self._running = False

    def _session_ended(self, session: int) -> bool:
        with self._lock:
            return session != self._session

    def _is_stopped(self, session: int) -> bool:
        with self._lock:
            return self._stop or session != self._session

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

    def _process(self, item: dict, session: int) -> None:
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
            if self._is_stopped(session):
                raise RuntimeError("зупинено")
            try:
                data = self._generator.generate(ref_path, prompt, item["model"], item["quality"])
                Path(out_path).write_bytes(data)
                last_err = None
                break
            except Exception as e:  # noqa: BLE001
                last_err = e
                if attempt < self._max_retries:
                    # Only back off when another attempt actually follows -
                    # sleeping after the final one just delays reporting the
                    # failure by 15s x max_retries with nothing to gain.
                    time.sleep(15 * attempt)
        if last_err:
            raise last_err

        entry = {"title": item["title"], "date": date.today().isoformat(),
                 "file": out_path, "background": bg,
                 "model": item["model"], "quality": item["quality"]}

        # One store-level read-modify-write, not load() here + save() under the
        # queue's lock. The old shape lost entries two ways: WORKERS workers
        # finishing close together both read the same snapshot before either
        # saved, and the queue's lock says nothing to a /api/forget arriving on
        # a request thread. The custom-prompt carry-over has to happen inside
        # the same critical section, since it reads the very entry it replaces.
        def record(history: dict) -> None:
            if item.get("prompt"):
                entry["prompt"] = item["prompt"]
            elif (history.get(lid) or {}).get("prompt"):
                entry["prompt"] = history[lid]["prompt"]
            history[lid] = entry

        self._history.update(record)
        with self._lock:
            item.update(status="ok", background=bg, out_file=Path(out_path).name)
        if self._on_spend:
            self._on_spend(item)
