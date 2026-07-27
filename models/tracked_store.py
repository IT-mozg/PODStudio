# -*- coding: utf-8 -*-
"""Persistence for user-tracked ("bookmarked") listings (tracked.json).

Unlike num_favorers/views/tags, "tracked" is not an Etsy concept at all -
it's our own user state, so it needs its own store rather than coming from
a listing source. Same single-responsibility shape as HistoryStore."""

import json
import os
import threading
from pathlib import Path


class TrackedStore:
    def __init__(self, path: Path):
        self.path = path
        # Flask runs threaded, so toggle()'s read-modify-write needs to be
        # serialized - two quick star clicks would otherwise both read the
        # same starting set and the second save() would drop the first
        # bookmark. Same pattern as container.config_lock.
        self._lock = threading.Lock()

    def load(self) -> set[str]:
        if self.path.exists():
            try:
                return set(json.loads(self.path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                pass
        return set()

    def save(self, tracked: set[str]) -> None:
        """Write via a temp file + atomic replace, so a concurrent load()
        can never observe a half-written (truncated) file and silently
        report nothing as tracked."""
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(sorted(tracked), ensure_ascii=False, indent=2),
                       encoding="utf-8")
        os.replace(tmp, self.path)

    def toggle(self, lid: str) -> bool:
        """Flips the tracked state of lid, persists it, returns the new state."""
        with self._lock:
            tracked = self.load()
            if lid in tracked:
                tracked.discard(lid)
                new_state = False
            else:
                tracked.add(lid)
                new_state = True
            self.save(tracked)
            return new_state
