# -*- coding: utf-8 -*-
"""Reading and writing the app's small JSON state files (history.json,
tracked.json, tracked_shops.json, ui_config.json).

One module rather than the same four lines in each store, because the
*write* has to be atomic and getting that wrong is invisible until it
isn't: `Path.write_text` truncates the file first and only then writes, so
for the duration of the write the file on disk is empty or half a
document. Flask runs threaded and the generation queue writes from worker
threads, so a reader genuinely lands in that window - and since every
reader here swallows `JSONDecodeError` to survive a corrupted file, the
symptom is not a crash but a silent `{}`: "Немає API-ключа" on a perfectly
good key, an empty generation history, a forgotten balance.

`write_json` writes a temp file next to the target and `os.replace`s it in.
That is atomic on POSIX (and on Windows for an existing target), so a
concurrent reader sees either the whole old document or the whole new one -
never a partial one. Which in turn is what lets `read_json` stay lock-free:
readers vastly outnumber writers here, and none of them has to coordinate
with anything.

The temp file is deliberately created in the *same directory* as the
target: `os.replace` is only atomic within a single filesystem, and
/tmp is frequently a different one.
"""

import json
import os
import threading
from pathlib import Path


def read_json(path: Path, default):
    """Parsed contents of `path`, or `default` if it doesn't exist or isn't
    readable as JSON. Never raises - a corrupted state file must not take
    the whole app down."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: Path, data) -> None:
    """Write `data` to `path` atomically (temp file + os.replace), so a
    concurrent read_json() can never observe a half-written file."""
    # Unique per writer: every caller today serializes its own writes behind
    # a lock, but a shared temp name would silently corrupt the write of
    # anyone who ever forgets to.
    tmp = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                       encoding="utf-8")
        os.replace(tmp, path)
    except BaseException:
        # Don't leave the temp file behind if the write or the replace
        # failed - the next attempt would still work, but the directory
        # would slowly fill with .tmp files.
        tmp.unlink(missing_ok=True)
        raise
