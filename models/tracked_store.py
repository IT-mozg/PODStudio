# -*- coding: utf-8 -*-
"""Persistence for user-tracked ("bookmarked") listings (tracked.json).

Unlike num_favorers/views/tags, "tracked" is not an Etsy concept at all -
it's our own user state, so it needs its own store rather than coming from
a listing source. Same single-responsibility shape as HistoryStore."""

import json
from pathlib import Path


class TrackedStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> set[str]:
        if self.path.exists():
            try:
                return set(json.loads(self.path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                pass
        return set()

    def save(self, tracked: set[str]) -> None:
        self.path.write_text(json.dumps(sorted(tracked), ensure_ascii=False, indent=2),
                             encoding="utf-8")

    def toggle(self, lid: str) -> bool:
        """Flips the tracked state of lid, persists it, returns the new state."""
        tracked = self.load()
        if lid in tracked:
            tracked.discard(lid)
            new_state = False
        else:
            tracked.add(lid)
            new_state = True
        self.save(tracked)
        return new_state
