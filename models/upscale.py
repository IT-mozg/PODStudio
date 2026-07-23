# -*- coding: utf-8 -*-
"""Python port of the Gigapixel step in POD_Halftone_Mask.jsx: an AI
upscaler. Implemented here with realesrgan-ncnn-vulkan - the same
open-source engine (Real-ESRGAN, ncnn/Vulkan build) that Upscayl
(github.com/upscayl/upscayl) wraps in its Electron UI. We call the same
compiled binary directly instead of depending on a Python ML stack.

The binary (~26MB, universal x86_64/arm64) and the chosen model's weights
are downloaded once, on first use, into vendor/realesrgan/ (gitignored -
see .gitignore). macOS only for now: the binary needs Vulkan, which on
macOS comes via MoltenVK bundled in the release build.
"""

import platform
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlretrieve

from PIL import Image

BASE = Path(__file__).resolve().parent.parent
VENDOR_DIR = BASE / "vendor" / "realesrgan"
BIN_DIR = VENDOR_DIR / "bin"
MODELS_DIR = VENDOR_DIR / "models"

BINARY_URL = ("https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/"
              "download/v0.2.0/realesrgan-ncnn-vulkan-v0.2.0-macos.zip")
MODEL_BASE_URL = "https://raw.githubusercontent.com/upscayl/upscayl/main/resources/models"

# A couple of curated options out of Upscayl's full model set - the rest
# are variants for photos/faces, not relevant to flat POD line-art/illustration.
MODELS = {
    "upscayl-standard-4x": "Стандарт — універсальна модель",
    "digital-art-4x": "Digital Art — чистіше на лайн-арті/плоскій ілюстрації",
}


def _binary_path() -> Path:
    return BIN_DIR / "realesrgan-ncnn-vulkan"


def _ensure_binary() -> Path:
    exe = _binary_path()
    if exe.exists():
        return exe
    if platform.system() != "Darwin":
        raise RuntimeError("Апскейл поки підключено лише для macOS.")

    BIN_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        zip_path = Path(td) / "realesrgan.zip"
        urlretrieve(BINARY_URL, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(td)
        extracted = next(Path(td).glob("realesrgan-ncnn-vulkan-*"))
        (extracted / "realesrgan-ncnn-vulkan").rename(exe)

    exe.chmod(exe.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    # Gatekeeper quarantines anything downloaded outside the App Store /
    # a signed installer - without lifting this macOS just refuses to run it.
    subprocess.run(["xattr", "-d", "com.apple.quarantine", str(exe)], capture_output=True)
    return exe


def _ensure_model(name: str) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for ext in (".param", ".bin"):
        dest = MODELS_DIR / f"{name}{ext}"
        if not dest.exists():
            urlretrieve(f"{MODEL_BASE_URL}/{name}{ext}", dest)


def upscale_image(image: Image.Image, model: str, scale: int, target_dpi: int = 300) -> Image.Image:
    if model not in MODELS:
        model = "upscayl-standard-4x"
    scale = scale if scale in (2, 3, 4) else 4

    exe = _ensure_binary()
    _ensure_model(model)

    with tempfile.TemporaryDirectory() as td:
        in_path = Path(td) / "in.png"
        out_path = Path(td) / "out.png"
        image.convert("RGB").save(in_path)

        proc = subprocess.run(
            [str(exe), "-i", str(in_path), "-o", str(out_path),
             "-n", model, "-s", str(scale), "-m", str(MODELS_DIR)],
            capture_output=True, text=True,
        )
        if proc.returncode != 0 or not out_path.exists():
            raise RuntimeError(f"Апскейл впав: {proc.stderr.strip() or 'невідома помилка'}")

        result = Image.open(out_path).convert("RGB")
        result.load()

    result.info["dpi"] = (target_dpi, target_dpi)
    return result
