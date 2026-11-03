# Object-led line wipe — draft method

Use `object_led_line_wipe@1` for matched locked-camera takes joined behind a moving straight object. It compiles two separate source-backed videos, native animated mask position and angle, and a bounded held ending. It is an editing helper; no reusable-complete or automatic-tracking claim is established.

## Inputs and preparation

Import unchanged originals and consume ready preview/render packages. Review the whole filming and final-edit reference, including release hands, the object's floor bounce and the reaction after the reveal. A teaching panel can already contain a mask; black in that panel is not an untreated source identity. Register source performances and framing separately. Never assume the two takes have the same source offset, or infer a global retime from a few ambiguous similar poses.

Measure on the outgoing original source clock. `boundary` holds `{source_seconds, top, angle}`: top is a full-canvas-height fraction, angle degrees. Begin exactly at the outgoing source in, with an explicit untreated top-zero state when the shot starts untreated. Supply increasing marks; the compiler snaps local times to project frames. Review every intervening crossing frame, not only authored keys. Use source-hash/frame/PTS annotations; approximate seek samples are not exact frames.

For a colored practical object, contrast segmentation can suggest a boundary; inspect the actual source before accepting it. Exclude clothing of the same color. A median fitted through the object can cut its top, especially during a bounce or motion blur. Protect the complete foam/prop envelope and any fingers above it. Keep the boundary above a protruding release hand until it clears; do not reveal the new background through the fingers. Check source and combined native-pixel crops, not just a thumbnail or a line overlay.

## Native construction

Inputs name outgoing `{source_url, source_duration_seconds, source_start_seconds, source_end_seconds}`, incoming `{source_url, source_duration_seconds, source_start_seconds}`, output duration, placement, source-bound boundary, two visual lanes and complete top-first lane order. Outgoing sits above incoming. Authored source windows and placement use the project frame grid; source duration may retain its real fractional tail. Incoming needs continuous coverage of the output.

An outgoing playable window can stop before a bad terminal frame. Any remaining output duration becomes `create_visual.trailing_hold_seconds` (maximum 30 seconds), which holds the last playable original frame without extending its source interval. Inspect the actual held frame; an imported video's container duration does not establish a safe final picture. Original pixels and source clocks stay separate from this held ending. Both picture layers are muted; requested sound is authored separately through sound-design from actual supplied assets.

Main dials: edge softness, incoming reaction timing, edge position. Advanced: incoming registration and Reveal → Original take (off). Incoming timing clamps to real source handles and does not shift the outgoing object clock. Native Mask rotation/position keys remain editable. Reset, removal, cancellation, Undo and reload must be exercised in the real editor; a valid block is not UI proof.

## Acceptance

Verify untreated opening, continuous lift/drop, reveal direction, every hand/prop crossing, complete new-outfit payoff, reaction and ending. Inspect the combined moving result and native pixels for shaved object edges, deleted fingers, duplicate props, floor seams, background jumps and black flashes. Preserve inherited source watermarks. Match reference framing explicitly or report the difference; a teaching crop is not the original canvas.

Use canonical logical dimensions before downscaling. Record actual encoded frame count, silent/audio policy and terminal source identity. Separate exact reference precision, component-faithful appearance, technical validation and transfer. A fresh raw-input agent must measure its own marks and stage one card from this method and contract; do not supply the prior accepted settings or output. A same-input fresh build tests repeatability, not different-performance transfer. Keep failed trials and bounded repair evidence private. Human Apply/Reject/export remain separate.
