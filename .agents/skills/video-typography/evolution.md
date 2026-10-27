# video-typography — evolution log

## 2026-10-27 — Video inside block letters (Video Letters template)

- **Observation:** The creator asked for a title "where the video plays through the letters", then rejected the marker and pen-script results: the letters must be big and thick to watch footage through. Video fills existed only for handwriting; block fonts fell back to thin pen strokes, and proposal GPU admission refused every new video-filled title because it never saw the fill's verified preview.
- **Decision:** Block text with `mediaFillVideoUrl` now carries the video in both renderers (GPU: text raster as mask plus the shared fill box; Standard: inline SVG text clip centred on the measured word box). Proposal admission receives the same fill-preview evidence the editor payload hydrates. Packaged as the Video Letters template, whose procedure moved into its own [video-letters](../video-letters/SKILL.md) skill.
- **Verification:** Caption fill, admission and effects tests pass; typecheck passes. Frame-state stills, preview video renders of two input sets and the editor's GPU player show footage inside Anton letters. A full export was not run.

## 2026-09-28 — Preserve saved reveal and compare a turning vector mask

- **Direction:** The creator asked to save the current approach, make it live across the prepared fonts, then try a line mask that turns around A, rises and descends.
- **Decision:** Preserve the default renderer snapshot and per-pack asset hashes under `saved-reveal-v1`. Keep native saved strokes as the default. Add an explicit Pacifico A experiment with cubic authored paths, a narrower upstroke and frame-driven vector reveal, retaining the original font contour throughout. Keep text and Drawing/Erasing controls native; other glyphs fall back to saved strokes.
- **Evidence:** Dedicated `handwriting-pacifico-line-mask-lab` has side-by-side comparisons at two speeds. Separate large source comparisons and dense intermediate sheets live under `experiments/pacifico-line-mask/audit`. Default adoption does not certify all-glyph motion. The experiment is a candidate: nib-width joins and turnaround behavior still require human playback review. General position/rotation keyframes are not exposed by this experiment.

## Purpose
Design readable titles, labels, callouts, and on-screen text as native editable text — never baked image cards. Scope: the typography layer — wording, sizing, contrast, safe placement, and on-screen duration; motion on text routes through the motion-graphics skill. Good looks like: text readable at a glance at delivery resolution, editable and revisable at any point, and no decorative treatment that costs legibility.

## 2026-09-27 — Blue steel inverse caption option
- **Observation:** The creator requested a reusable option and agent handoff for the inverted words in @anderson.taii's reel. Inverse Video already implements the blend; its source-dependent blue appearance was missing a named recipe.
- **Decision:** Updated routing to an optional style recipe and a named inspector look using existing stored properties. Preserve speech clocks; document the missing aligned per-word downward entrance instead of claiming a full recreation.
- **Verification:** Reference opening and word-change frames were inspected. All 38 caption/skill-discovery tests, typecheck and the 15-entry catalog hash/backlink check passed. Catalog remains candidate pending a new-footage recreation and live UI/motion verification.

## 2026-09-27 — Effect recipe packaging
- **Observation:** Reference analysis and successful recreation were not distinguished in catalog data.
- **Decision:** Link versioned evidence receipts with explicit candidate/partial/complete status.
- **Verification:** Catalog validation checks media hashes and both ownership links; recorded limitations remain unresolved.

## 2026-09-27 — Image-filled handwriting
- **Observation:** A route/fact card needed real pen-stroke reveals with sky inside the letters; the handwriting renderer previously returned before the image-fill branch.
- **Decision:** Combine native handwriting with one canvas-wide image mask. Preserve glyph counters and per-font guides; expose existing fill controls and text anchors in native graphic-text creation. Keep the result editable.
- **Verification:** Delivery-resolution proposal frames show partial and completed Permanent Marker lettering with sky/cloud fill. Typecheck and five focused URL-resolution/font-guide tests passed. The still instrument now uses the export pipeline's nested media URL resolver. Full-motion taste approval remains with the creator.


## 2026-09-28 · Moving sky headings and factual identity

A requested aircraft stat sheet exposed two needs: preserve the exact displayed actor
when the edit returns to it, and separate generated-family appearance from an actual
flight registration. Native handwritten headings now accept a silent video fill via
`mediaFillVideoUrl`; verify real motion and preserve the source duration. White stat
rows can appear without pen-stroke entrances. Do not infer a new aircraft from a
separate boarding photo and replace the actor the user asked to retain.

## 2026-09-28 — Natural stroke review and visible controls

- **Observation:** The creator rejected B's curve reveal while the stem was still drawing. Full-mask coverage audits had not established natural pen motion; the inspector also displayed empty still-image controls for an active video mask.
- **Decision:** Cache exclusive stroke regions per font, keep the font contour masked throughout, use a descending B stem then a pen lift and continuous curves, and ease each pen-down gesture. Create `marker-alphabet-lab` with full alphabet sheets and isolated letters. Show actual mask media in Properties; label handwriting duration Drawing time and support longer slow reviews.
- **Verification:** Native partial B frames and completed uppercase glyphs were inspected. B and alphabet drawing times persist as 3s and 8s. Caption/marker tests pass. All-letter intermediate gesture quality remains reviewable in the lab, not certified by completion coverage.

## 2026-09-28 — Saved review and compact animation controls

- Observation: creator accepted the shown alphabet lab result and requested a reusable record; the Animation panel exposed excessive choices and an explanatory banner.
- Decision: store scoped acceptance with font-pack hashes in `review.json`; document automatic reuse via Permanent Marker + Handwriting. Show Effect and Drawing time directly, keep alternative effects in a selector, and move handwriting explanations to contextual help.
- Review scope: acceptance of the shown result does not certify every intermediate glyph gesture.
- Verification: 47 focused tests and typecheck passed. Browser review confirmed At start / At end, the compact Effect selector, and Drawing time at 3.00 seconds; the effect choices remain available and the explanatory banner and duplicate heading are gone.

## 2026-09-28 — Match regions to exact-case stroke guides

- Observation: lowercase i in “in Budapest” was clipped to the uppercase I top-bar region, leaving its stem missing.
- Cause: a single-gesture lowercase guide intentionally has no exclusive region file entry, but renderer fallback inherited regions from its multi-gesture capital.
- Decision: choose regions using the exact same guide key as stroke layout. An exact lowercase guide without regions remains unrestricted; it never inherits capital regions.
- Verification: five handwriting tests and typecheck passed. Reviewed renders at 9.15, 9.2, 9.3 and 10.6 seconds confirm partial and completed lowercase i. Caption wording, timing and placement unchanged.

## 2026-09-28 — Stable moving footage inside handwriting

- Observation: at the same paused frame, route lettering and the aircraft heading disappeared intermittently, despite video decoders being ready. Seeking could restore only part of the title.
- Decision: keep video in an HTML media element masked with a self-contained SVG data image. Avoid video inside SVG foreignObject under nested SVG masks. Reuse the exact animated glyph and stroke contours, frame clock, source/proxy authority, and caption dimensions. Apply the shared fill route to Permanent Marker, prepared packs, and the fallback renderer.
- Verification: browser backward/forward seek restored and retained both full headings at 15.6 seconds. Rendered instrument frames at 15.6 and 16.3 reviewed. Six focused tests and typecheck passed. No timeline mutation.

## 2026-09-28 — Per-font handwriting candidates and honest coverage

- **Observation:** Preparing every handwritten font revealed four additional registry entries below intervening font categories; the inventory test caught the omission. The creator clarified lowercase i as dot first, then line. Completion-only checks missed fragmented loop/crossing reveals.
- **Decision:** Save licensed regular-400 source contours, advances and pair kerning with separately authored ordered gestures for all 12 non-reference fonts. Use physical trajectory-time ownership and keep exact contour masks through completion. Route native Handwriting and Drawing/Erasing controls to the packs; inspector status distinguishes saved candidates, whole unsupported characters and pen-script fallback. Preserve dot-first i as this session's authored choice, not a universal style rule.
- **Evidence:** Each pack contains a hashed review receipt, 85-character checklist, production intermediate sheets and playable `handwriting-<slug>-review` project. All 1,020 glyphs were visually inspected at 10/25/50/75/100% plus source. Each gesture midpoint is saved but not every midpoint was visually inspected. Separate frame-state reports cover B/i for all labs. Larger 480×640 comparisons on Alex Brush O/& and Sacramento period pass 99% and were visually inspected.
- **Limitations:** Every new font remains **motion needs review**. Disconnected loop/crossing patches and imperfect flourish plans are flagged per character; all-character continuous playback and human acceptance remain pending. Base glyphs/pair kerning do not establish contextual ligature/alternate or other-weight parity. No Budapest timeline or media was mutated for this work.
- **Verification:** 73 focused handwriting/image-fill/skill checks and typecheck passed. Inventory, source/license hashes, exact-case anatomy, preserved metrics, explicit lifts, B/i order, production measurement parity and current evidence hashes are covered. All 12 dedicated review projects opened for Play.

## 2026-09-28 — Adopt turning line masks across every handwritten font

- **Direction:** The creator selected the Pacifico A experiment and requested the same approach for all fonts.
- **Decision:** Make continuous cubic line masks the default for all 13 registry fonts and all 85 prepared characters. Keep source contours masked through completion, original advances/kerning, explicit pen lifts and native Drawing/Erasing controls. Preserve the former method and its source/asset hashes as Previous saved reveal. Retain the accepted A segments and clock exactly.
- **Findings:** Base-glyph raster preparation must disable contextual alternates to match saved contours; RAQM caused missing Pacifico q/s ink. Targeted Indie Flower stem/bowl guides replace misplaced generic paths, but F/P/R still show provisional fragments. A fitted, ordered B stem plus thickness-scaled ownership corridor avoids a gap before the bowls. Unrestricted medial fitting can introduce backtracking and is not a general motion fix.
- **Evidence:** Per-font line-audit source comparisons and sampled intermediate sheets cover 1,105 characters; thin glyphs also have larger comparisons. Dedicated 13-font overview and Permanent Marker alphabet assemblies complement the existing 12 alphabet labs. line-review.json and line-checklist.json separate inspected stages from saved midpoint frames and pending continuous playback.
- **Limits:** Source completeness and vector edges do not certify natural motion. Ornate capitals and crossing/turn joins retain flagged notches or detached reveals. Human acceptance is scoped to the shown Pacifico A and method choice; all-font continuous-motion acceptance remains pending. Base glyphs at regular 400 do not establish ligature/contextual-alternate or other-weight parity. No Budapest timeline or media mutation was made for this work.

- **Validation:** 128 focused handwriting/image-fill/caption tests and typecheck passed. All 13 line receipts validate current asset/image hashes, 85-character coverage, stem/dot order and lifts, persistent contour masks, default/backup routing, and scoped acceptance. Remaining motion issues are enumerated rather than certified.

## 2026-10-03 — route attached surface lettering

- **Observation:** Moving planar lettering needs tracking and visibility diagnosis beyond screen typography.
- **Decision:** Link the dedicated surface-text-tracking procedure while retaining typography ownership of lettering.
- **Verification:** Target skill exists; catalog/purpose and surface-track tests passed (9 total). Routing walkthrough separates screen text, surface text and masks; no new footage trial.

## 2026-10-14 — Templates from @nvision.media recreations

- **Observation:** Effects recreated from a @willrvail breakdown of an @nvision.media video were worth reusing as Templates; smaller transitions (wipe, layer crossfade, slow-motion breather, handheld, closer) were not distinct enough.
- **Decision:** Package each kept effect as a template page under `templates/`, linked from Packaged templates, with a Properties → Templates card and Pexels teaching media built from demo proposal previews.
- **Verification:** Each template ran on two input sets in its own demo project (proposals only, none approved); entrance, peak and settled frames were checked with `pnpm frame-state --proposal-file` and GPU preview renders. Limits are listed on each page.
