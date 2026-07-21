# -*- coding: utf-8 -*-
"""Persistence for the generation history (history.json). Single
responsibility - read/write only; no business logic or knowledge of the
generation queue lives here."""

import json
from pathlib import Path


class HistoryStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> dict:
        if self.path.exists():
            try:
                return json.loads(self.path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                pass
        return {}

    def save(self, history: dict) -> None:
        self.path.write_text(json.dumps(history, ensure_ascii=False, indent=2),
                             encoding="utf-8")

    def forget(self, lid: str) -> None:
        history = self.load()
        if lid in history:
            del history[lid]
            self.save(history)
