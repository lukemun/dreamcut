# Feathered window zoom

Native 2D prototype: place the destination inside an opening before the camera move, then enlarge the opening until it leaves the canvas. This avoids a separate iris reveal or a visible mid-move image swap.

## Inputs

- A source frame with a centered window/opening. Use a held frame when the recording already moves; an untracked moving window will drift away from the mask.
- An exterior image with a compatible horizon, light, and color. This is a separate editable layer.
- A short acceleration interval and a landing hold.

## Construction

Place the exterior above the source. Use **Zoom transition → Oval reveal** to fit the opening and **Oval feather** to blend the border. Both layers start together, with the destination already present. Coordinate the window's Scale animation and the oval radius. The nearer surround can grow faster than the distant exterior to suggest depth. Keep all layers full enough to avoid exposing black canvas.

**Edge blur** preserves the central focal area and softens the perimeter during acceleration. It is a spatially masked soft blur, not a physically accurate radial motion-streak filter. Return it to zero on landing. Ordinary **Blur** remains available separately.

The controls support clip-local keyframes, numeric editing, reset, and the editor's ordinary Undo. Agents can create or revise native visual layers through `transition_keyframes` in a proposal. Supported fields are `media_scale`, `media_opacity`, `iris_radius`, `iris_feather`, `zoom_blur`, and `transition_blur`. Source files are preserved.

## Limits and checks

The oval is canvas-centered and matches the canvas aspect ratio. Off-center windows and independently adjustable ellipse axes are not supported by these controls. Feathering cannot repair a major lighting, horizon, or perspective mismatch. It does not reconstruct an exterior camera move or aircraft rotation.

Review every frame across the acceleration, the boundary between footage and held frame, and the final landing. Inspect at normal speed as well. A circular patch appearing halfway through is a failed construction: the exterior must already be inside the opening. Spatial assessment reports masks and blur as requiring pixel review; a clear analytical report is not proof of blending quality.

Production-wrapper pixel checks cover closed/open oval alpha and center-preserving peripheral blur. Full creator interaction coverage across reset/Undo and both editor layouts remains a separate product verification task.
