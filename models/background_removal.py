# -*- coding: utf-8 -*-
"""Python port of the "illustration" branch of POD_Halftone_Mask.jsx:
Photoshop's Select Subject (Sensei AI) replaced with a flood-fill cutout
from the four corners, not a general-purpose saliency model.

Every design this pipeline sees is generated against a flat, solid
background by construction (the generation prompt always asks for a plain
white or black background - see PROMPT_TEMPLATE in generate_designs.py), so
a saliency model built for "find the one subject in a photo" (rembg/u2net
was tried first) actually does worse here: on multi-object illustrations
(e.g. a grid of insects) it fades out everything but the one it decides is
"the subject". A flood fill from the corners keyed on color distance to the
sampled background is a much better fit for this specific domain: it is
deterministic, fast, and only ever removes the region that is actually
contiguous with the background, so it never eats into a detail inside the
artwork just because that detail happens to share the background's color.
"""

import numpy as np
from PIL import Image
from scipy.ndimage import label

CORNER_PATCH = 6      # px sampled at each corner to estimate the bg color
TOLERANCE = 28         # color distance (0-441) fully treated as background
FEATHER = 18           # extra distance over which the edge fades in


def _bg_color(rgb: np.ndarray) -> np.ndarray:
    p = CORNER_PATCH
    corners = np.concatenate([
        rgb[:p, :p].reshape(-1, 3), rgb[:p, -p:].reshape(-1, 3),
        rgb[-p:, :p].reshape(-1, 3), rgb[-p:, -p:].reshape(-1, 3),
    ])
    return corners.mean(axis=0)


def _border_connected(mask: np.ndarray) -> np.ndarray:
    """Keep only the connected components of `mask` that touch an edge of
    the image - i.e. the actual background, not a same-colored patch
    stranded inside the artwork."""
    labeled, _ = label(mask, structure=np.ones((3, 3)))
    border_labels = set(labeled[0, :].tolist()) | set(labeled[-1, :].tolist()) \
        | set(labeled[:, 0].tolist()) | set(labeled[:, -1].tolist())
    border_labels.discard(0)
    if not border_labels:
        return np.zeros_like(mask)
    return np.isin(labeled, list(border_labels))


def remove_background(image: Image.Image, target_dpi: int = 300) -> Image.Image:
    rgb = np.array(image.convert("RGB")).astype(np.float32)
    dist = np.linalg.norm(rgb - _bg_color(rgb), axis=2)

    inner = _border_connected(dist <= TOLERANCE)
    outer = _border_connected(dist <= TOLERANCE + FEATHER)
    edge = outer & ~inner

    alpha = np.full(dist.shape, 255, dtype=np.float32)
    alpha[inner] = 0
    edge_frac = np.clip((dist - TOLERANCE) / FEATHER, 0, 1)
    alpha[edge] = edge_frac[edge] * 255

    result = Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha.astype(np.uint8)]), "RGBA")
    result.info["dpi"] = (target_dpi, target_dpi)
    return result
