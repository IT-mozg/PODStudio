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
                  them, e.g. to switch from manual HTML import to the
                  official Etsy API).
"""

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

PORT = 8765

app = Flask(__name__,
           template_folder=str(container.BASE / "views" / "templates"),
           static_folder=str(container.BASE / "views" / "static"))

for _bp in (pages_bp, listings_bp, generation_bp, history_bp, settings_bp, editing_bp):
    app.register_blueprint(_bp)


if __name__ == "__main__":
    threading.Timer(1.2, lambda: webbrowser.open(
        f"http://127.0.0.1:{PORT}")).start()
    print(f"\nPOD Studio: http://127.0.0.1:{PORT}  (Ctrl+C to stop)\n")
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
