---
name: video-typography
description: Design readable titles, labels, callouts, and on-screen text for a DreamCut video.
---

# Video typography

For text attached to a moving note, sign or other flat object, use
[surface-text-tracking](../surface-text-tracking/SKILL.md).

Read `../open-edit-proposals/SKILL.md` before timeline work.
Read `../visual-timing/SKILL.md` for spoken anchors and paragraph builds, `../caption-craft/SKILL.md` for literal speech, and `../spatial-composition/SKILL.md` for placement among other actors.

Use a clear hierarchy, restrained line length, consistent margins, and sufficient contrast. Design for the real delivery canvas and keep text away from faces, controls, and platform overlays. Avoid decorative motion that competes with speech.

Keep editable text native. Do not substitute full-frame image cards for claims, statistics, quotations, or paragraph builds. Propose text content, style, position, timing, and animation together so the user can preview the complete build in context.

Treat a one-line graphic label as one scalable object: changing its font size scales its authored text box by the same ratio, while the box remains independently adjustable afterward. Keep audio-linked spoken captions on their fixed semantic caption rail; they may fit down within that rail to preserve the one-line caption contract.

## Handwritten image masks

Native `handwriting` entrances and exits can combine with `styleVariant: image_fill`.
For real moving footage inside these headings, use `mediaFillVideoUrl` with a silent
project video long enough for the caption and its separately validated
`mediaFillVideoPreviewUrl`. Player uses the proxy and fails closed when absent;
render uses the full-quality source. The video replaces the still-image sequence
and plays on the caption-local frame clock through the same glyph mask.
Moving media stays in an HTML element with a self-contained SVG glyph mask; do not place a video inside a masked SVG foreignObject, which can disappear after seeking. The pen reveal masks the image through the glyphs; the fill stays continuous across
the whole label rather than restarting inside each letter. All 13 editor handwriting fonts use licensed regular-400 contours and authored
continuous vector line masks by default. Animation → **Reveal** offers **Turning
line mask** and **Previous saved reveal**; the former preserves the accepted
Pacifico A arc/rise/descent. The previous renderer and assets remain archived in
`saved-reveal-v1/`. Inspector status is **Turning line mask · motion needs review**:
method adoption does not certify every character. Unsupported characters appear
whole in the selected font; fonts without a pack use the labeled pen-script fallback.
The advancing round nib follows cubic paths with explicit lifts and spatial
per-gesture clips. Source contours remain authoritative through completion.
Native Drawing/Erasing time drives the reveal; this is procedural path animation,
without editable position/rotation keyframes in the general Keyframes panel.

Keep the wording, font, write duration, image source, fill scale and pan independently
editable. Use project media for the fill and inspect both partial strokes and the
completed title. An image-filled label still needs phone-readable sizing and contrast.
Properties shows the actual media under **Media inside text**. Use Animation →
**Drawing time** to change the pen speed; smaller values draw faster. Handwriting
durations support up to 60 seconds, bounded by the selected clip in the inspector.
Each font caches ordered vector paths and exclusive gesture regions so broad
nibs do not expose later gestures. After guide changes, rebuild line assets and
review partial strokes in its alphabet project as well as completed letters. Completion coverage alone does not establish natural motion.
`create_text` accepts the existing bounded fill controls and absolute text anchors,
so a proposal can show the complete treatment before approval.

For preparing or revising font packs, follow the
[handwriting pack workflow](references/handwriting-packs.md) and the
[font coverage checklist](../../../src/lib/timeline/handwriting/fonts/coverage-checklist.md).
Inspect intermediates for every character and preserve separate coverage,
sampled-frame, continuous-motion and human-acceptance receipts. Never derive
writing order from outline point order.

## Packaged templates

[Lyric Pop](templates/lyric-pop.md): one gold serif word springs onto the shot on a beat and holds.

## Effect recipe evidence

For blue steel word captions, reuse **Inverse Video** with the optional
[blue-steel-inverse-captions](../../style-recipes/blue-steel-inverse-captions.md)
look. Its named inspector option changes appearance and preserves caption clocks.
The recipe separates supported inversion from the unimplemented aligned per-word
downward entrance; inspect actual footage before claiming the reference match.

[Catalog-linked input/output evidence](references/effect-evidence.json) records reference, recreation, hashes, and limitations. Candidate and partial records do not establish a verified reusable effect.
