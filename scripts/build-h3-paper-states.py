"""Build aligned H3 pose stills and matching entrance paper silhouettes.

Only deterministic resampling/contour dilation is used; the subject pixels come
from the approved H3 clip's existing alpha extractions.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "projects/scratchpad-layered-cutout/media/sources"
CANVAS = (918, 1912)
POSES = [1, 4, 7, 10, 12, 14, 16]
ROLES = ["white", "blue", "green", "red", "yellow", "orange", "purple"]
RADII = [10, 23, 39, 59, 84, 114, 150]
SMOOTHING = [1.0, 1.6, 2.3, 3.2, 4.4, 5.8, 7.5]
COLORS = [
    (247, 244, 235), (29, 105, 214), (32, 176, 91),
    (220, 55, 52), (241, 194, 43), (239, 125, 50), (123, 75, 196),
]


def bbox_and_anchor(image: Image.Image) -> tuple[int, int, int, int, float]:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha > 128)
    torso_x = np.where(alpha[350:700] > 128)[1]
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), float(np.median(torso_x))


def main() -> None:
    inputs = {i: Image.open(SOURCE / f"h3-motion-alpha-{i:02}.png").convert("RGBA") for i in POSES}
    first_box = bbox_and_anchor(inputs[1])
    scale = 1574 / (first_box[3] - first_box[1] + 1)
    target_anchor_x = 459
    target_feet_y = 1743
    output = {}
    for i, image in inputs.items():
        left, top, right, bottom, torso_x = bbox_and_anchor(image)
        resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        x = round(target_anchor_x - torso_x * scale)
        y = round(target_feet_y - bottom * scale)
        canvas = Image.new("RGBA", CANVAS)
        canvas.alpha_composite(resized, (x, y))
        path = SOURCE / f"h3-paper-pose-{i:02}.png"
        if not path.exists():
            canvas.save(path, optimize=True)
        output[i] = path
        print(f"pose {i:02}: input_bbox={(left, top, right, bottom)}, torso_x={torso_x:.1f}, offset={(x, y)}")

    alpha = np.asarray(Image.open(output[1]).getchannel("A"))
    solid = alpha > 128
    distance = distance_transform_edt(~solid)
    rng = np.random.default_rng(20260920)
    grain = rng.normal(0, 2.1, size=alpha.shape)
    for role, radius, smoothing, color in zip(ROLES, RADII, SMOOTHING, COLORS):
        shape = (distance <= radius).astype(np.uint8) * 255
        softened = Image.fromarray(shape).filter(ImageFilter.GaussianBlur(smoothing))
        # Smooth the contour geometry, then restore an opaque, cut-paper edge.
        # The earlier assets left Gaussian alpha as-is, producing a fuzzy halo.
        shape = np.clip((np.asarray(softened, dtype=np.float32) - 110) * 12, 0, 255).astype(np.uint8)
        rgb = np.stack([
            np.clip(channel + grain, 0, 255).astype(np.uint8) for channel in color
        ], axis=-1)
        rgba = np.dstack((rgb, shape))
        path = SOURCE / f"h3-paper-contour-{role}-crisp-v2.png"
        Image.fromarray(rgba, "RGBA").save(path, optimize=True)
        print(f"contour {role}: radius={radius}, {path.name}")

    # The returning paper shapes are separately animated timeline actors. Their
    # original silhouettes were also based on the old subject, so replace only
    # their alpha shapes while preserving the timeline's recolor controls.
    # These sheets sit *behind* the persistent purple radius-150 outline.
    # Their radii must begin outside purple or the front purple sheet hides
    # the return entirely. Increments match the authored 10/13/16/20/25/30
    # paper-band rhythm rather than scaling copies of the silhouette.
    return_radii = [160, 173, 189, 209, 234, 264]
    large_alpha = np.zeros((CANVAS[1] * 3, CANVAS[0] * 3), dtype=np.uint8)
    large_alpha[CANVAS[1]:CANVAS[1] * 2, CANVAS[0]:CANVAS[0] * 2] = alpha
    return_distance = distance_transform_edt(~(large_alpha > 128))
    for index, radius in enumerate(return_radii, start=1):
        shape = (return_distance <= radius).astype(np.uint8) * 255
        softened = Image.fromarray(shape).filter(ImageFilter.GaussianBlur(3))
        shape = Image.fromarray(np.clip((np.asarray(softened, dtype=np.float32) - 110) * 12, 0, 255).astype(np.uint8))
        paper = Image.new("RGBA", shape.size, (255, 255, 255, 0))
        paper.putalpha(shape)
        path = SOURCE / f"h3-return-paper-{index}-even-v3.png"
        paper.save(path, optimize=True)
        print(f"return paper {index}: radius={radius}, {path.name}")


if __name__ == "__main__":
    main()
