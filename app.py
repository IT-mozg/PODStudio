# -*- coding: utf-8 -*-
"""
POD Studio - local web interface for the design generator.

Run:  python3 app.py
Opens http://127.0.0.1:8765 in the browser.
Requires: pip3 install flask openai beautifulsoup4 pillow

This project follows a classic MVC layout:
  - models/       domain logic and data: listing sources, the AI design
                  generator, the generation queue, history persistence
                  (see models/listing_source.py, models/design_generator.py,
                  models/generation_queue.py, models/history_store.py).
  - views/        templates and static assets (views/templates,
                  views/static).
  - controllers/  Flask blueprints that translate HTTP requests into calls
                  on the models and return a view (JSON or a template).
  - container.py  the composition root: wires concrete model
                  implementations together (see that file for how to swap
                  one, e.g. the listing source or the AI design generator).
"""

import socket
import subprocess
import sys
import threading
import webbrowser

from flask import Flask

import container  # noqa: F401  (composition root - importing it wires everything up)
from controllers.editing_controller import editing_bp
from controllers.generation_controller import generation_bp
from controllers.history_controller import history_bp
from controllers.listings_controller import listings_bp
from controllers.pages_controller import pages_bp
from controllers.settings_controller import settings_bp
from controllers.shops_controller import shops_bp

PORT = 8765

app = Flask(__name__,
           template_folder=str(container.BASE / "views" / "templates"),
           static_folder=str(container.BASE / "views" / "static"))

for _bp in (pages_bp, listings_bp, shops_bp, generation_bp, history_bp,
            settings_bp, editing_bp):
    app.register_blueprint(_bp)


def port_owner(port: int) -> int | None:
    """PID listening on `port`, or None if it's free.

    Worth the extra check because of how confusing the alternative is: an
    already-running instance makes Flask print "Address already in use" and
    exit, the old process keeps serving happily, and the *browser* then shows
    a stale app - so a route added minutes ago 404s and it looks like the
    feature is broken rather than the server being old."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if probe.connect_ex(("127.0.0.1", port)) != 0:
            return None
    try:  # macOS/Linux; if lsof isn't there we still report "busy", just without a pid
        out = subprocess.run(["lsof", "-ti", f"tcp:{port}", "-sTCP:LISTEN"],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    pids = [int(p) for p in out.split() if p.isdigit()]
    return pids[0] if pids else 0


if __name__ == "__main__":
    owner = port_owner(PORT)
    if owner is not None:
        who = f" (PID {owner})" if owner else ""
        print(f"\nПорт {PORT} уже зайнятий{who} - найімовірніше, це старий "
              f"запущений POD Studio.\nВін і далі віддає старий код, тому нові "
              f"роути в браузері будуть 404.\n")
        if owner:
            print(f"Зупини його і запусти знову:\n  kill {owner} && python3 app.py\n")
        sys.exit(1)

    threading.Timer(1.2, lambda: webbrowser.open(
        f"http://127.0.0.1:{PORT}")).start()
    print(f"\nPOD Studio: http://127.0.0.1:{PORT}  (Ctrl+C to stop)\n")
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
