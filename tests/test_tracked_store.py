# -*- coding: utf-8 -*-
"""models/tracked_store.py - regression cover for the bookmark toggle.

TrackedStore already serialized toggle() behind a lock and already wrote
atomically before this batch; these tests exist so the move onto the shared
models/json_store.py helpers can't quietly undo either property."""

import threading

from models.tracked_store import TrackedStore


def test_toggle_flips_and_persists(tmp_path):
    store = TrackedStore(tmp_path / "tracked.json")
    assert store.toggle("42") is True
    assert store.load() == {"42"}
    assert store.toggle("42") is False
    assert store.load() == set()


def test_missing_file_reads_as_empty(tmp_path):
    assert TrackedStore(tmp_path / "nothing.json").load() == set()


def test_corrupted_file_reads_as_empty(tmp_path):
    path = tmp_path / "tracked.json"
    path.write_text("[[[", encoding="utf-8")
    assert TrackedStore(path).load() == set()


def test_concurrent_toggles_keep_every_bookmark(tmp_path):
    """Two quick star clicks used to both read the same starting set, and the
    second save() dropped the first bookmark."""
    store = TrackedStore(tmp_path / "tracked.json")
    ids = [str(n) for n in range(50)]
    start = threading.Barrier(len(ids))

    def toggle(item_id: str):
        start.wait()
        store.toggle(item_id)

    threads = [threading.Thread(target=toggle, args=(i,)) for i in ids]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert store.load() == set(ids)


def test_reader_during_writes_never_sees_an_empty_set(tmp_path):
    """A load() concurrent with a save() must not silently report nothing as
    tracked - which is what a truncated read degrades into."""
    store = TrackedStore(tmp_path / "tracked.json")
    ids = {str(n) for n in range(200)}
    store.save(ids)

    done = threading.Event()
    bad: list[int] = []

    def writer():
        try:
            for _ in range(200):
                store.save(ids)
        finally:
            done.set()

    def reader():
        while not done.is_set():
            seen = store.load()
            if len(seen) != len(ids):
                bad.append(len(seen))

    threads = [threading.Thread(target=writer), threading.Thread(target=reader)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    assert not bad, f"partial reads observed: {bad[:5]}"
