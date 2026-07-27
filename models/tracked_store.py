# -*- coding: utf-8 -*-
"""Persistence for user-tracked ("bookmarked") ids.

Unlike num_favorers/views/tags, "tracked" is not an Etsy concept at all -
it's our own user state, so it needs its own store rather than coming from
a listing/shop source. Same single-responsibility shape as HistoryStore.

The ids are opaque to this class, so one instance per kind of thing being
bookmarked: container.py keeps tracked.json for listings and
tracked_shops.json for shops."""

import threading
from pathlib import Path

from .json_store import read_json, write_json


class TrackedStore:
    def __init__(self, path: Path):
        self.path = path
        # Flask runs threaded, so toggle()'s read-modify-write needs to be
        # serialized - two quick star clicks would otherwise both read the
        # same starting set and the second save() would drop the first
        # bookmark. Same pattern as container.config_lock.
        self._lock = threading.Lock()

    def load(self) -> set[str]:
        return set(read_json(self.path, []))

    def save(self, tracked: set[str]) -> None:
        """Written atomically (see models/json_store.py), so a concurrent
        load() can never observe a half-written file and silently report
        nothing as tracked."""
        write_json(self.path, sorted(tracked))

    def toggle(self, item_id: str) -> bool:
        """Flips the tracked state of item_id, persists it, returns the new state."""
        with self._lock:
            tracked = self.load()
            if item_id in tracked:
                tracked.discard(item_id)
                new_state = False
            else:
                tracked.add(item_id)
                new_state = True
            self.save(tracked)
            return new_state
