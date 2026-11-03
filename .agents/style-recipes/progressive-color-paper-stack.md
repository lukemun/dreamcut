---
id: progressive-color-paper-stack
title: Progressive color paper stack
execution_skill: layered-paper-cutout
status: available
---

# Progressive color paper stack

An optional collage treatment developed from the reviewed `scratchpad-layered-cutout` sequence. It makes the foreground cutout feel physically pasted above a fan of increasingly broad paper echoes.

This is a subjective recipe, not the definition of a correct layered cutout. Use it when the user requests this look, when a project decision selects it, or when an applicable active personal preference points to this recipe.

## Look

- Front-to-back palette: warm white, blue, green, red, yellow.
- Visible band widths: `10, 13, 16, 20, 25` pixels at the recipe's authored asset scale.
- Contour smoothing: `1.0, 1.6, 2.3, 3.2, 4.4`, increasing toward the back so outer sheets become rounder and do not repeat every small ridge.
- Surface: subtle deterministic paper grain; preserve solid color and clean antialiased edges.
- Depth: compact alpha-aware shadows between sheets, with the subject clearly highest and no directional halo mistaken for another border.
- Alignment: identical canvas, center, timeline transform, and duration for every layer.

Widths are asset-scale values, not universal screen pixels. Preserve their ratios when the source resolution or intended display size changes, then judge the combined proposal preview rather than individual PNGs alone.

## Builder parameters

Use the deterministic builder from the execution skill:

```bash
python3 .agents/skills/layered-paper-cutout/scripts/build_layered_paper_cutout.py \
  --input /absolute/path/to/transparent-actor.png \
  --output-dir /absolute/path/to/output \
  --layer 'white:#f7f4eb:10:1.0' \
  --layer 'blue:#1d69d6:13:1.6' \
  --layer 'green:#20b05b:16:2.3' \
  --layer 'red:#dc3734:20:3.2' \
  --layer 'yellow:#f1c22b:25:4.4' \
  --preview
```

The execution skill owns source handling, geometric correctness, overscan, editability, proposal review, and verification. A change to this palette or its visual rhythm creates a recipe variation; it does not weaken those contracts.
