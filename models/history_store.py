# -*- coding: utf-8 -*-
"""Persistence for the generation history (history.json). Single
responsibility - read/write only; no business logic or knowledge of the
generation queue lives here.

Every read-modify-write goes through update(), which holds this store's own
lock for the whole load->mutate->save cycle. That is not optional here:
GenerationQueue runs WORKERS generations in parallel and each one records
its result, while Flask request threads can delete entries at the same
time. Doing the load outside the lock (which is what _process used to do)
means two workers finishing close together both read the same snapshot and
the second save() overwrites the first one's entry - a design that was
generated, paid for, and written to output/ silently missing from history.

The lock is this store's own rather than the queue's, because the queue's
lock cannot protect against a /api/forget call arriving from a request
thread - that path never touches the queue at all."""

import threading
from pathlib import Path
from typing import Callable

from .json_store import read_json, write_json


class HistoryStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.RLock()

    def load(self) -> dict:
        """A snapshot of the history. Deliberately lock-free: writes land
        atomically (see models/json_store.py), so a reader always sees a
        whole document. Callers that intend to write back what they read
        must use update() instead."""
        return read_json(self.path, {})

    def save(self, history: dict) -> None:
        with self._lock:
            write_json(self.path, history)

    def update(self, mutate: Callable[[dict], None]) -> dict:
        """mutate(history) -> None, changing it in place. Load, mutate and
        save happen under one lock, so concurrent callers can't lose each
        other's changes. Returns the saved history."""
        with self._lock:
            history = self.load()
            mutate(history)
            write_json(self.path, history)
            return history

    def forget(self, lid: str) -> None:
        self.update(lambda history: history.pop(lid, None))
