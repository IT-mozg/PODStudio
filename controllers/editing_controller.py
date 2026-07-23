# -*- coding: utf-8 -*-
"""Controller for the "Редагування" tab: browsing already-generated images
in output/ and applying the halftone-mask pipeline to a selection of them.
sketch_black/sketch_white are wired to models.halftone (the Python port of
POD_Halftone_Mask.jsx); illustration goes through models.background_removal
(a flood-fill cutout, standing in for Photoshop's Select Subject); upscale
goes through models.upscale (realesrgan-ncnn-vulkan, the engine behind
Upscayl, standing in for the Gigapixel step)."""

from pathlib import Path

from flask import Blueprint, jsonify, request
from PIL import Image

import container
from models import generate_designs as engine
from models.background_removal import remove_background
from models.halftone import apply_sketch_halftone
from models.upscale import MODELS as UPSCALE_MODELS
from models.upscale import upscale_image

editing_bp = Blueprint("editing", __name__, url_prefix="/api")

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}

# Pillow mode -> the colorspace label designers actually recognize.
COLORSPACE_LABEL = {
    "RGB": "RGB", "RGBA": "SRGB", "L": "GRAYSCALE", "LA": "GRAYSCALE",
    "CMYK": "CMYK", "P": "INDEXED", "1": "BITMAP",
}


def _image_info(path: Path) -> dict:
    with Image.open(path) as im:
        w, h = im.size
        dpi = round(im.info.get("dpi", (72, 72))[0])
        colorspace = COLORSPACE_LABEL.get(im.mode, im.mode)
    return {"width": w, "height": h, "dpi": dpi, "colorspace": colorspace}

# Mirrors CFG in POD_Halftone_Mask.jsx (minus the Gigapixel/export settings,
# which don't apply here - Gigapixel is a separate Photoshop plugin and the
# output path/suffix are decided by this app, not the user).
DEFAULT_SETTINGS = {
    "auto_detect": True,
    "force_type": None,  # null (auto) | "sketch_white" | "sketch_black" | "illustration"
    "sat_threshold": 12,
    "white_lum_threshold": 235,
    "black_lum_threshold": 25,

    "bitmap_method": "halftone",  # "halftone" | "diffusion"
    "halftone_frequency": 40,
    "halftone_angle": 45,
    "halftone_shape": "round",  # round | diamond | ellipse | line | square | cross

    "levels_black": 10,
    "levels_white": 80,
    "levels_gamma": 1,

    "brighten_design": True,
    "brightness": 35,
    "contrast": -10,
    "shadow_lift": 1.45,
    "fade_black": 25,
    "saturation": 55,

    "target_dpi": 300,

    "upscale_model": "upscayl-standard-4x",
    "upscale_scale": 4,  # 2 | 3 | 4
}


@editing_bp.get("/edit/images")
def api_edit_images():
    files = [f for f in engine.OUT_DIR.iterdir()
             if f.is_file() and f.suffix.lower() in IMAGE_EXT]
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    out = []
    for f in files:
        item = {"name": f.name, "thumb": f"/outputs/{f.name}",
                "ext": f.suffix.lstrip(".").upper(),
                "size_mb": round(f.stat().st_size / (1024 * 1024), 1)}
        try:
            item.update(_image_info(f))
        except Exception:
            item.update({"width": None, "height": None, "dpi": None, "colorspace": ""})
        out.append(item)
    return jsonify({"images": out})


@editing_bp.get("/edit/upscale-models")
def api_edit_upscale_models():
    return jsonify({"models": [{"value": k, "label": v} for k, v in UPSCALE_MODELS.items()]})


@editing_bp.get("/edit/settings")
def api_edit_settings():
    cfg = container.load_config().get("editing", {})
    merged = dict(DEFAULT_SETTINGS)
    merged.update(cfg)
    return jsonify(merged)


@editing_bp.post("/edit/settings")
def api_edit_settings_save():
    data = request.get_json(force=True)
    settings = {k: data[k] for k in DEFAULT_SETTINGS if k in data}
    container.update_config(lambda cfg: cfg.__setitem__("editing", settings))
    return jsonify({"ok": True})


EDITED_DIR = engine.OUT_DIR / "edited"

SKETCH_TYPES = {"sketch_black": False, "sketch_white": True}  # type -> invert mask
VALID_TYPES = set(SKETCH_TYPES) | {"illustration", "upscale"}
SUFFIX = {"sketch_black": "_halftone", "sketch_white": "_halftone",
         "illustration": "_cutout", "upscale": "_upscaled"}


@editing_bp.post("/edit/apply")
def api_edit_apply():
    data = request.get_json(force=True)
    names = data.get("images", [])
    type_ = data.get("type")
    if not names:
        return jsonify({"error": "Не вибрано жодного зображення."}), 400
    if type_ not in VALID_TYPES:
        return jsonify({"error": "Невідомий тип обробки."}), 400

    settings = dict(DEFAULT_SETTINGS)
    settings.update(container.load_config().get("editing", {}))

    EDITED_DIR.mkdir(exist_ok=True)
    results, errors = [], []
    for name in names:
        src = engine.OUT_DIR / name
        if not src.exists():
            errors.append({"name": name, "error": "Файл не знайдено."})
            continue
        try:
            with Image.open(src) as im:
                if type_ == "illustration":
                    result = remove_background(im, settings["target_dpi"])
                elif type_ == "upscale":
                    result = upscale_image(im, settings["upscale_model"],
                                           int(settings["upscale_scale"]),
                                           settings["target_dpi"])
                else:
                    result = apply_sketch_halftone(im, settings, SKETCH_TYPES[type_])
            out_name = f"{Path(name).stem}{SUFFIX[type_]}.png"
            result.save(EDITED_DIR / out_name, dpi=(settings["target_dpi"],) * 2)
            results.append({"name": name, "result": f"/outputs/edited/{out_name}"})
        except Exception as e:
            errors.append({"name": name, "error": str(e)})

    return jsonify({"results": results, "errors": errors})
