"""Track an object (e.g. a hand) through a frame sequence with SAM 2 and emit per-frame masks.

Usage:
  venv/bin/python hand_cutout.py \
    --frames <dir of %05d.jpg> --out <mask dir> \
    --prompt-frame 40 --points "950,1020;920,830" --labels "1,1" \
    [--negatives "508,1060;1026,384"] [--box "700,780,1079,1320"] [--chunk-frames 400]

Masks are written as <out>/%05d.png (white = object), numbered to match the
input frames, one per frame across the whole sequence (empty where the object
is absent). Compositing to an alpha webm happens in ffmpeg afterwards.

SAM 2 loads every frame of a sequence onto the device at once. On Apple MPS a
tensor may not exceed INT_MAX elements, so a ~58 s 1080p30 window fails. Longer
sequences are therefore tracked in chunks of at most --chunk-frames: the chunk
around the prompt frame takes the clicks, and each following (or preceding)
chunk overlaps its neighbour by one frame and is seeded with that frame's mask.
Sequences that fit in one chunk take the original single-pass path unchanged.
"""

import argparse
import os
import shutil
import tempfile

import numpy as np
import torch
from PIL import Image

from sam2.build_sam import build_sam2_video_predictor
from mask_postprocess import DEFAULT_MAX_HOLE_AREA_RATIO, fill_small_enclosed_holes

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CKPT = os.path.join(HERE, "sam2.1_hiera_small.pt")
DEFAULT_CONFIG = "configs/sam2.1/sam2.1_hiera_s.yaml"
# 600 frames (20 s at 30 fps) are known to track on a 1024px SAM 2 input; ~1,740 overflow.
DEFAULT_CHUNK_FRAMES = 400


def parse_points(raw):
    if not raw:
        return []
    return [[float(v) for v in pair.split(",")] for pair in raw.split(";") if pair.strip()]


def chunk_plan(total, size, prompt_frame):
    """Tracking sessions for `total` frames in chunks of at most `size`.

    Returns (start, end, local_prompt, direction) tuples in run order. The first
    session holds the prompt frame and runs both directions from the clicks.
    Forward sessions start on the previous session's last frame and reverse
    sessions end on the previous session's first frame; both are seeded with
    that shared frame's mask, which they keep.
    """
    if size < 2:
        raise ValueError("chunk size must be at least 2")
    first = max(0, min(prompt_frame - size // 2, total - size))
    last = min(total, first + size)
    plan = [(first, last, prompt_frame - first, "both")]
    seam = last - 1
    while seam < total - 1:
        end = min(total, seam + size)
        plan.append((seam, end, 0, "forward"))
        seam = end - 1
    seam = first
    while seam > 0:
        start = max(0, seam - size + 1)
        plan.append((start, seam + 1, seam - start, "reverse"))
        seam = start
    return plan


def free_device_memory():
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prompt-frame", type=int, required=True)
    ap.add_argument("--points", required=True, help="positive clicks 'x,y;x,y' in source pixels")
    ap.add_argument("--negatives", default="", help="negative clicks 'x,y;x,y'")
    ap.add_argument("--box", default="", help="optional tight prompt box 'x1,y1,x2,y2' in source pixels")
    ap.add_argument(
        "--max-hole-area-ratio",
        type=float,
        default=DEFAULT_MAX_HOLE_AREA_RATIO,
        help="fill enclosed background holes no larger than this fraction of the frame (default: 0.001)",
    )
    ap.add_argument(
        "--chunk-frames",
        type=int,
        default=DEFAULT_CHUNK_FRAMES,
        help="longest run of frames tracked in one SAM 2 session (default: 400)",
    )
    ap.add_argument("--ckpt", default=DEFAULT_CKPT)
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    args = ap.parse_args()
    if args.chunk_frames < 2:
        raise ValueError("--chunk-frames must be at least 2")

    if torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    print(f"device: {device}")

    pos = parse_points(args.points)
    neg = parse_points(args.negatives)
    points = np.array(pos + neg, dtype=np.float32)
    labels = np.array([1] * len(pos) + [0] * len(neg), dtype=np.int32)
    box = np.array([float(value) for value in args.box.split(",")], dtype=np.float32) if args.box else None
    if box is not None and box.shape != (4,):
        raise ValueError("--box must contain exactly four comma-separated coordinates")

    frame_names = sorted(
        (f for f in os.listdir(args.frames) if f.lower().endswith((".jpg", ".jpeg"))),
        key=lambda f: int(os.path.splitext(f)[0]),
    )
    os.makedirs(args.out, exist_ok=True)

    predictor = build_sam2_video_predictor(args.config, args.ckpt, device=device)

    masks = {}
    frames_with_filled_holes = 0
    filled_hole_pixels = 0

    def collect(frame_idx, mask_logits, *, preserve_existing=False):
        nonlocal frames_with_filled_holes, filled_hole_pixels
        # Forward and reverse propagation both emit the prompt frame. Keep the
        # forward result: the reverse pass can otherwise replace the reviewed
        # prompt mask with a visibly degraded one-frame outlier. Chunk seams keep
        # the mask that seeded the next chunk for the same reason.
        if preserve_existing and frame_idx in masks:
            return
        mask = (mask_logits[0] > 0.0).cpu().numpy().squeeze()
        cleaned = fill_small_enclosed_holes(mask, args.max_hole_area_ratio)
        filled_pixels = int(np.count_nonzero(cleaned & ~mask))
        if filled_pixels > 0:
            frames_with_filled_holes += 1
            filled_hole_pixels += filled_pixels
        masks[frame_idx] = cleaned

    def prompt(state, local_idx, seed=None):
        # A seam seeds the chunk with the neighbouring mask; an empty seam (the object
        # left the frame) falls back to the original clicks so tracking can resume.
        if seed is not None and seed.any():
            predictor.add_new_mask(state, frame_idx=local_idx, obj_id=1, mask=seed)
        else:
            predictor.add_new_points_or_box(
                state, frame_idx=local_idx, obj_id=1, points=points, labels=labels, box=box
            )

    if len(frame_names) <= args.chunk_frames:
        state = predictor.init_state(video_path=args.frames)
        prompt(state, args.prompt_frame)
        for frame_idx, _obj_ids, mask_logits in predictor.propagate_in_video(state):
            collect(frame_idx, mask_logits)
        for frame_idx, _obj_ids, mask_logits in predictor.propagate_in_video(
            state, start_frame_idx=args.prompt_frame, reverse=True
        ):
            collect(frame_idx, mask_logits, preserve_existing=True)
        chunk_count = 1
    else:
        # Chunk sessions read symlinked subsets of the extracted frames, so no image is copied.
        scratch = tempfile.mkdtemp(prefix=".sam2-chunk-", dir=os.path.dirname(os.path.abspath(args.out)))
        chunk_count = 0

        def track(start, end, local_prompt, direction, seed=None):
            """Track frames [start, end) in one session; local_prompt is relative to start."""
            nonlocal chunk_count
            chunk_count += 1
            chunk_dir = os.path.join(scratch, str(chunk_count))
            os.makedirs(chunk_dir)
            for local, global_idx in enumerate(range(start, end)):
                os.symlink(os.path.abspath(os.path.join(args.frames, frame_names[global_idx])),
                           os.path.join(chunk_dir, f"{local:05d}.jpg"))
            state = predictor.init_state(video_path=chunk_dir)
            prompt(state, local_prompt, seed)
            if direction in ("both", "forward"):
                for local, _obj_ids, mask_logits in predictor.propagate_in_video(state, start_frame_idx=local_prompt):
                    collect(start + local, mask_logits, preserve_existing=True)
            if direction in ("both", "reverse"):
                for local, _obj_ids, mask_logits in predictor.propagate_in_video(
                    state, start_frame_idx=local_prompt, reverse=True
                ):
                    collect(start + local, mask_logits, preserve_existing=True)
            del state
            free_device_memory()
            shutil.rmtree(chunk_dir)

        try:
            for start, end, local_prompt, direction in chunk_plan(len(frame_names), args.chunk_frames, args.prompt_frame):
                seam_mask = None if direction == "both" else masks.get(start + local_prompt)
                track(start, end, local_prompt, direction, seam_mask)
        finally:
            shutil.rmtree(scratch, ignore_errors=True)

    covered = 0
    for idx, name in enumerate(frame_names):
        mask = masks.get(idx)
        stem = os.path.splitext(name)[0]
        if mask is None or not mask.any():
            first = Image.open(os.path.join(args.frames, name))
            img = Image.new("L", first.size, 0)
        else:
            img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
            covered += 1
        img.save(os.path.join(args.out, f"{stem}.png"))

    print(
        f"wrote {len(frame_names)} masks ({covered} with object) to {args.out} in {chunk_count} "
        f"tracking session(s); filled {filled_hole_pixels} enclosed pixels across {frames_with_filled_holes} frames"
    )


if __name__ == "__main__":
    main()
