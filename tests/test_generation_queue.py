# -*- coding: utf-8 -*-
"""models/generation_queue.py - session handling and the retained-results cap.

No network and no OpenAI: the queue takes its generator, listing source,
history store and reference resolver as constructor dependencies, so a fake
for each is all it takes to drive it (which is the point of that design).

test_superseded_batch_stops_generating is the regression that matters here.
start_new() replaced _items wholesale but could not un-submit the previous
batch's futures, so every one of them still ran - each a paid OpenAI image
for a batch the user had already replaced, landing in history with no
progress bar to show for it. The session token lets those workers notice
and exit before they generate."""

import threading
import time

import pytest

from models.generation_queue import MAX_RETAINED_ITEMS, GenerationQueue, ReferenceResolver
from models.history_store import HistoryStore


class FakeGenerator:
    """Returns bytes immediately, or blocks on `gate` - which is what lets a
    test hold a batch "in flight" while it does something else."""

    def __init__(self):
        self.gate = None
        self.calls = 0
        self._lock = threading.Lock()

    def generate(self, reference_path, prompt, model, quality) -> bytes:
        with self._lock:
            self.calls += 1
        gate = self.gate
        if gate is not None:
            assert gate.wait(timeout=30), "generation gate never opened"
        return b"PNG"


class FakeListingSource:
    """Answers nothing: _resolve_reference falls back to the item's own title
    and the fake ReferenceResolver below, so no lookup is needed."""

    def get_by_ids(self, lids):
        return {}

    def list_pages(self):
        return []

    def get_page(self, page_id):
        return {}

    def get_all(self):
        return {}


def build_queue(tmp_path, generator=None, max_workers=2, max_retries=1):
    generator = generator if generator is not None else FakeGenerator()
    (tmp_path / "ref.jpg").write_bytes(b"JPG")
    refs = ReferenceResolver(
        get_reference=lambda lid, info: str(tmp_path / "ref.jpg"),
        shirt_background=lambda path: "білий",
        title_to_filename=lambda title: f"{title}.png",
    )
    queue = GenerationQueue(
        generator=generator,
        listing_source=FakeListingSource(),
        history=HistoryStore(tmp_path / "history.json"),
        refs=refs,
        out_dir=tmp_path,
        prompt_builder=lambda title, bg: f"{title}/{bg}",
        max_workers=max_workers,
        max_retries=max_retries,
    )
    return queue, generator


def items(*lids):
    return [{"lid": str(lid), "title": f"design {lid}", "status": "wait",
             "model": "gpt-image-2", "quality": "low"} for lid in lids]


def wait_until(predicate, timeout=30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_batch_runs_and_records_every_item(tmp_path):
    queue, _ = build_queue(tmp_path)
    queue.start_new(items(1, 2, 3))
    assert wait_until(lambda: not queue.status()["running"])

    status = queue.status()
    assert status["total"] == 3
    assert status["ok"] == 3, status["items"]
    assert set(queue._history.load()) == {"1", "2", "3"}


def test_superseded_batch_stops_generating(tmp_path):
    """Items still queued when start_new() lands must never reach the
    generator - each one is a paid image for a batch the user replaced."""
    generator = FakeGenerator()
    gate = threading.Event()
    generator.gate = gate
    queue, _ = build_queue(tmp_path, generator, max_workers=1)

    queue.start_new(items(1, 2, 3, 4, 5))
    assert wait_until(lambda: generator.calls >= 1), "first batch never started"
    calls_when_superseded = generator.calls

    queue.start_new(items(20))
    generator.gate = None          # the new item shouldn't block
    gate.set()                     # release the one old worker mid-generation
    assert wait_until(lambda: not queue.status()["running"])

    # The one already inside generate() couldn't be recalled; items 2-5 were
    # dropped without generating. Plus the single new item.
    assert generator.calls == calls_when_superseded + 1, (
        f"{generator.calls - calls_when_superseded - 1} superseded generation(s) "
        f"still ran")
    assert queue.status()["total"] == 1


def test_stale_worker_stays_out_of_the_new_session(tmp_path):
    """A superseded worker that was already generating finishes its own work
    (the image is paid for, so it is still recorded), but must not appear in
    the new session's results or touch its progress."""
    generator = FakeGenerator()
    old_gate = threading.Event()
    generator.gate = old_gate
    queue, _ = build_queue(tmp_path, generator, max_workers=4)

    queue.start_new(items(1, 2))
    assert wait_until(lambda: generator.calls >= 2), "first batch never started"

    new_gate = threading.Event()
    generator.gate = new_gate
    queue.start_new(items(10, 11))
    assert wait_until(lambda: generator.calls >= 4), "second batch never started"

    old_gate.set()  # the superseded workers finish first, mid-flight
    assert wait_until(lambda: set(queue._history.load()) >= {"1", "2"})
    assert queue.status()["running"], \
        "a stale worker finishing must not report the live batch as done"

    new_gate.set()
    assert wait_until(lambda: not queue.status()["running"])

    status = queue.status()
    assert [i["lid"] for i in status["items"]] == ["10", "11"]
    assert status["ok"] == 2, status["items"]
    # Nothing was lost: all four generated images are in history, even though
    # only the live session's two are on screen.
    assert set(queue._history.load()) == {"1", "2", "10", "11"}


def test_enqueue_updates_an_existing_item_in_place(tmp_path):
    queue, _ = build_queue(tmp_path)
    queue.start_new(items(1, 2))
    assert wait_until(lambda: not queue.status()["running"])

    queue.enqueue(items(1))
    assert wait_until(lambda: not queue.status()["running"])

    status = queue.status()
    assert [i["lid"] for i in status["items"]] == ["1", "2"], "no duplicate, no reorder"
    assert status["total"] == 2


def test_retained_results_are_capped(tmp_path):
    """enqueue() never clears the list, so without a cap it grows for the life
    of the process - and status() serializes all of it on every poll."""
    queue, _ = build_queue(tmp_path)
    for lid in range(MAX_RETAINED_ITEMS + 25):
        queue.enqueue(items(lid))
        assert wait_until(lambda: not queue.status()["running"])

    status = queue.status()
    assert status["total"] == MAX_RETAINED_ITEMS
    assert status["items"][-1]["lid"] == str(MAX_RETAINED_ITEMS + 24), "newest kept"
    assert "0" not in [i["lid"] for i in status["items"]], "oldest evicted"


def test_trim_never_evicts_an_unfinished_item(tmp_path):
    queue, _ = build_queue(tmp_path)
    with queue._lock:
        for lid in range(MAX_RETAINED_ITEMS + 10):
            queue._items[str(lid)] = {"lid": str(lid), "status": "wait"}
            queue._order.append(str(lid))
        queue._trim()
        assert len(queue._order) == MAX_RETAINED_ITEMS + 10, \
            "nothing had finished, so nothing was safe to drop"


def test_failed_generation_is_reported_not_swallowed(tmp_path):
    class FailingGenerator:
        def __init__(self):
            self.calls = 0

        def generate(self, *a, **kw):
            self.calls += 1
            raise RuntimeError("boom")

    queue, generator = build_queue(tmp_path, FailingGenerator())
    queue.enqueue(items(1))
    assert wait_until(lambda: not queue.status()["running"])

    status = queue.status()
    assert status["fail"] == 1
    assert "boom" in status["items"][0]["error"]
    assert generator.calls == 1, "max_retries=1 means exactly one attempt"
    assert queue._history.load() == {}, "a failed generation must not be recorded"


def test_concurrent_workers_record_every_result(tmp_path):
    """The end-to-end version of the HistoryStore lost-update bug: several
    workers finishing at once, each writing its own entry."""
    queue, _ = build_queue(tmp_path, max_workers=8)
    queue.start_new(items(*range(24)))
    assert wait_until(lambda: not queue.status()["running"], timeout=60)

    history = queue._history.load()
    missing = [str(n) for n in range(24) if str(n) not in history]
    assert not missing, f"lost {len(missing)} history entries: {missing}"
    assert queue.status()["ok"] == 24


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
