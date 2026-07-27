# -*- coding: utf-8 -*-
"""models/json_store.py - the atomic write is the whole point of the module,
so that is what these check.

test_reader_never_sees_a_partial_file is the regression for the bug: with the
old Path.write_text (truncate, then write) a reader landing inside that window
got a JSONDecodeError, and since every caller swallows that to survive a
corrupted file, the user saw "Немає API-ключа" on a perfectly valid key. It
fails reliably against the old implementation and passes against os.replace."""

import json
import threading

import pytest

from models.json_store import read_json, write_json


def test_round_trip(tmp_path):
    path = tmp_path / "state.json"
    write_json(path, {"a": 1, "ключ": "значення"})
    assert read_json(path, None) == {"a": 1, "ключ": "значення"}


def test_missing_file_returns_default(tmp_path):
    assert read_json(tmp_path / "nope.json", {}) == {}
    assert read_json(tmp_path / "nope.json", []) == []


def test_corrupted_file_returns_default(tmp_path):
    path = tmp_path / "broken.json"
    path.write_text("{not json at all", encoding="utf-8")
    assert read_json(path, {"fallback": True}) == {"fallback": True}


def test_no_temp_files_left_behind(tmp_path):
    path = tmp_path / "state.json"
    for i in range(5):
        write_json(path, {"i": i})
    assert [p.name for p in tmp_path.iterdir()] == ["state.json"]


def test_temp_file_removed_when_serialization_fails(tmp_path):
    path = tmp_path / "state.json"
    write_json(path, {"good": 1})
    with pytest.raises(TypeError):
        write_json(path, {"bad": object()})  # not JSON-serializable
    assert [p.name for p in tmp_path.iterdir()] == ["state.json"]
    assert read_json(path, None) == {"good": 1}, "failed write must not damage the old file"


def test_reader_never_sees_a_partial_file(tmp_path):
    """A reader hammering the file while a writer rewrites it 200 times must
    never observe anything but a complete document."""
    path = tmp_path / "state.json"
    # Big enough that a non-atomic write takes more than one syscall - a
    # truncate-then-write implementation is trivially caught in the act.
    payload = {str(i): "x" * 200 for i in range(500)}
    write_json(path, payload)

    done = threading.Event()
    bad_reads: list[str] = []

    def writer():
        try:
            for i in range(200):
                payload["marker"] = str(i)
                write_json(path, payload)
        finally:
            done.set()

    def reader():
        while not done.is_set():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, FileNotFoundError) as e:
                bad_reads.append(f"{type(e).__name__}: {e}")
                continue
            if len(data) < 500:
                bad_reads.append(f"truncated document: {len(data)} keys")

    threads = [threading.Thread(target=writer)] + [
        threading.Thread(target=reader) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    assert not bad_reads, f"reader saw a partial file: {bad_reads[:5]}"
