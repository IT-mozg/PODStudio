# -*- coding: utf-8 -*-
"""Python port of the "sketch" branch of POD_Halftone_Mask.jsx: grayscale ->
Levels -> halftone-screen (or diffusion-dither) bitmap, used as the alpha
mask of the original design, then a brighten pass (Levels/Brightness-
Contrast/Saturation) on the RGB so the print isn't too dark on a shirt.

Not ported: the Gigapixel upscale step (a separate Photoshop plugin,
irrelevant here) and the "illustration" branch (Select Subject - needs a
real background-removal model, e.g. rembg, wired in separately later).
"""

import numpy as np
from PIL import Image


def _apply_levels(arr, in_black, in_white, gamma, out_black=0, out_white=255):
    t = (arr.astype(np.float32) - in_black) / max(in_white - in_black, 1e-6)
    t = np.clip(t, 0, 1) ** (1.0 / max(gamma, 1e-6))
    return out_black + t * (out_white - out_black)


def _halftone_screen_alpha(gray, dpi, frequency, angle):
    """Classic AM halftone: a rotated grid of cells, each rendered as a dot
    whose radius grows with how dark that cell is - black dot = full ink =
    hidden (alpha 0), white gap = see-through-to-design = shown (alpha 255).
    One brightness sample per cell (nearest-neighbour), not a full-area
    average - a common simplification that is fast and, for the smooth
    AI-generated art this pipeline sees, visually indistinguishable."""
    h, w = gray.shape
    cell = max(dpi / max(frequency, 1e-6), 1.0)
    theta = np.radians(angle)
    cos_a, sin_a = np.cos(theta), np.sin(theta)

    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    rx = xs * cos_a + ys * sin_a
    ry = -xs * sin_a + ys * cos_a
    ix = np.round(rx / cell)
    iy = np.round(ry / cell)
    cx, cy = ix * cell, iy * cell
    dist = np.hypot(rx - cx, ry - cy)

    # cell center, rotated back into the original (unrotated) pixel grid
    ox = np.clip(np.round(cx * cos_a - cy * sin_a), 0, w - 1).astype(np.int32)
    oy = np.clip(np.round(cx * sin_a + cy * cos_a), 0, h - 1).astype(np.int32)
    cell_brightness = gray[oy, ox]

    coverage = np.clip(1 - cell_brightness / 255.0, 0, 1)
    max_radius = cell * 0.70711  # half-diagonal: coverage=1 fills the cell edge-to-edge
    radius = max_radius * np.sqrt(coverage)
    ink = dist <= radius
    return np.where(ink, 0, 255).astype(np.uint8)


def _diffusion_alpha(gray):
    im = Image.fromarray(gray.astype(np.uint8), "L").convert("1", dither=Image.FLOYDSTEINBERG)
    bmp = np.array(im.convert("L"))
    return np.where(bmp < 128, 0, 255).astype(np.uint8)


def _brighten(rgb, brightness, contrast, shadow_lift, fade_black, saturation):
    arr = _apply_levels(rgb, 0, 255, shadow_lift, fade_black, 255)

    b = float(brightness)
    arr = np.where(b < 0, arr * (255 + b) / 255, arr + (255 - arr) * b / 255)

    c = np.clip(contrast, -100, 100) * 2.55
    factor = (259 * (c + 255)) / (255 * (259 - c))
    arr = factor * (arr - 128) + 128
    arr = np.clip(arr, 0, 255).astype(np.uint8)

    if saturation:
        hsv = np.array(Image.fromarray(arr, "RGB").convert("HSV")).astype(np.float32)
        hsv[..., 1] = np.clip(hsv[..., 1] * (1 + saturation / 100.0), 0, 255)
        arr = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    return arr


def apply_sketch_halftone(image: Image.Image, settings: dict, invert: bool) -> Image.Image:
    """sketch_black (invert=False) / sketch_white (invert=True): halftone-
    screen mask cut from Levels(grayscale), pasted as the design's alpha,
    then an optional brighten pass on the RGB."""
    rgb_img = image.convert("RGB")
    rgb = np.array(rgb_img)
    gray = np.array(rgb_img.convert("L")).astype(np.float32)
    gray = _apply_levels(gray, settings["levels_black"], settings["levels_white"],
                          settings["levels_gamma"])

    if str(settings.get("bitmap_method")).lower() == "diffusion":
        alpha = _diffusion_alpha(gray)
    else:
        alpha = _halftone_screen_alpha(gray, settings["target_dpi"],
                                       settings["halftone_frequency"],
                                       settings["halftone_angle"])
    if invert:
        alpha = 255 - alpha

    if settings.get("brighten_design", True):
        rgb = _brighten(rgb, settings["brightness"], settings["contrast"],
                        settings["shadow_lift"], settings["fade_black"],
                        settings["saturation"])

    result = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    dpi = settings.get("target_dpi", 300)
    result.info["dpi"] = (dpi, dpi)
    return result
