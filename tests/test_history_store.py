# -*- coding: utf-8 -*-
"""models/history_store.py under concurrency.

test_concurrent_updates_keep_every_entry is the regression for the worst bug
in this batch: GenerationQueue ran WORKERS generations in parallel and each
one did `history = store.load()` outside the lock, then `history[lid] = entry;
store.save(history)` inside it. Two workers finishing close together therefore
both saved from the same snapshot, and the second one silently dropped the
first one's entry - a design that was generated and paid for, missing from
history. Against that shape this test loses entries every run."""

import threading

from models.history_store import HistoryStore


def test_forget_removes_only_that_entry(tmp_path):
    store = HistoryStore(tmp_path / "history.json")
    store.update(lambda h: h.update({"1": {"title": "a"}, "2": {"title": "b"}}))
    store.forget("1")
    assert store.load() == {"2": {"title": "b"}}


def test_forget_unknown_id_is_a_no_op(tmp_path):
    store = HistoryStore(tmp_path / "history.json")
    store.update(lambda h: h.update({"1": {"title": "a"}}))
    store.forget("does-not-exist")
    assert store.load() == {"1": {"title": "a"}}


def test_update_sees_the_entry_it_replaces(tmp_path):
    """The custom-prompt carry-over in GenerationQueue relies on reading the
    previous entry from inside the same critical section that overwrites it."""
    store = HistoryStore(tmp_path / "history.json")
    store.update(lambda h: h.update({"1": {"prompt": "старий"}}))

    seen = {}

    def mutate(history):
        seen["previous"] = history.get("1")
        history["1"] = {"prompt": "новий"}

    store.update(mutate)
    assert seen["previous"] == {"prompt": "старий"}
    assert store.load() == {"1": {"prompt": "новий"}}


def test_concurrent_updates_keep_every_entry(tmp_path):
    """20 threads each record their own listing. All 20 must survive."""
    store = HistoryStore(tmp_path / "history.json")
    workers = 20
    start = threading.Barrier(workers)

    def record(n: int):
        start.wait()  # maximize the overlap
        store.update(lambda h: h.__setitem__(str(n), {"title": f"design {n}"}))

    threads = [threading.Thread(target=record, args=(n,)) for n in range(workers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    history = store.load()
    missing = [str(n) for n in range(workers) if str(n) not in history]
    assert not missing, f"lost {len(missing)} entries: {missing}"


def test_concurrent_update_and_forget_never_corrupt_the_file(tmp_path):
    """A /api/forget arriving from a Flask request thread runs against the
    queue's writes and shares no lock with them - only the store's own."""
    store = HistoryStore(tmp_path / "history.json")
    store.update(lambda h: h.update({str(n): {"title": str(n)} for n in range(50)}))

    errors: list[str] = []

    def writer():
        try:
            for n in range(100, 200):
                store.update(lambda h, n=n: h.__setitem__(str(n), {"title": str(n)}))
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e))

    def forgetter():
        try:
            for n in range(50):
                store.forget(str(n))
        except Exception as e:  # noqa: BLE001
            errors.append(repr(e))

    threads = [threading.Thread(target=writer), threading.Thread(target=forgetter)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, errors
    history = store.load()
    assert history, "the file must still be readable JSON with content"
    # Everything the forgetter deleted stays deleted, everything the writer
    # added is present - neither side's work was rolled back by the other.
    assert not [n for n in range(50) if str(n) in history]
    assert not [n for n in range(100, 200) if str(n) not in history]
