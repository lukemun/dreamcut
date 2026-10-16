"""Deterministic binary-mask cleanup for local cutout generation."""

import numpy as np
from scipy import ndimage


DEFAULT_MAX_HOLE_AREA_RATIO = 0.001


def fill_small_enclosed_holes(mask, max_area_ratio=DEFAULT_MAX_HOLE_AREA_RATIO):
    """Fill small background components enclosed by foreground.

    Background connected to a frame edge is never filled. Enclosed components
    larger than ``max_area_ratio`` of the frame are preserved so real openings,
    such as the space between an arm and torso, remain transparent.
    """

    binary = np.asarray(mask, dtype=bool)
    if binary.ndim != 2:
        raise ValueError("mask must be a two-dimensional array")
    if max_area_ratio < 0 or max_area_ratio > 1:
        raise ValueError("max_area_ratio must be between 0 and 1")
    if binary.size == 0 or max_area_ratio == 0:
        return binary.copy()

    # binary_fill_holes leaves edge-connected background alone and marks only
    # enclosed background. Label those holes so the area gate can preserve
    # large, legitimate openings inside a pose.
    enclosed = ndimage.binary_fill_holes(binary) & ~binary
    if not enclosed.any():
        return binary.copy()

    max_area = max(1, int(round(binary.size * max_area_ratio)))
    labels, count = ndimage.label(enclosed)
    component_areas = np.bincount(labels.ravel(), minlength=count + 1)
    allowed = component_areas <= max_area
    allowed[0] = False
    return binary | allowed[labels]
