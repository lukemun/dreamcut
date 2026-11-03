# visual-timing — evolution log

## Purpose
Time supporting visuals, graphic actors, and on-screen text to spoken beats: entrances, holds, replacements, and exits. Scope: timing only — placement and composition belong to spatial-composition, the look to video-typography. Good looks like: every entrance, hold, and exit motivated by a spoken beat; coordinated replacements for accumulated builds; nothing lingering past its narrative job or popping in unmotivated.

## 2026-09-29 — Visible motion duration
- **Observation:** In a speed-exit review, extended offscreen travel consumed animation time without making the visible blur easier to see. The creator explicitly requested a shared default to stop motion after clearance unless continued motion has a clear purpose.
- **Decision:** Updated — canonical policy lives in the spatial-authoring standard, also linked from reusable effect capabilities. This skill now separates visible movement from offscreen holds and checks clearance, re-entry, and effect bounds.
- **Verification:** Instruction walkthrough covers an exit with no return, a purposeful continuous return trajectory, and unavailable effect bounds. Repository skill checks validate purpose and discovery; this documentation change does not establish automatic runtime stopping or a newly verified video result.

## 2026-09-20
- **Observation:** For recurring actors bridging adjacent beats, verify continuous frame coverage at every boundary, remove unintended black gaps, and vary source motion when a long hold would otherwise appear frozen. Evidence: 20260918T192450-ee153d26, 20260918T211741-d32f914b, 20260918T212454-6099fd8e, 20260918T230240-b5f001cc.
- **Decision:** Updated — Approved Memory improvement `0fc3507fcdf29cbc7252156354f0c9c975d75a8a756d56f4d9518fb4ee1e5bba` from retros `0598b207-21a8-48d3-8919-f0b5e5eccb45`. Reconciled candidates: 0fc3507fcdf29cbc7252156354f0c9c975d75a8a756d56f4d9518fb4ee1e5bba.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.

## 2026-09-27 — Effect recipe packaging
- **Observation:** Reference analysis and successful recreation were not distinguished in catalog data.
- **Decision:** Link versioned evidence receipts with explicit candidate/partial/complete status.
- **Verification:** Catalog validation checks media hashes and both ownership links; recorded limitations remain unresolved.

## 2026-10-25 — Sounds follow the visual timing
- **Observation:** Sounds placed by eye at single cues drifted from a drawn sketch; sounds driven by the visual's own activity curve lined up within 10 ms. Retiming a visual also leaves its sounds behind unless they are re-checked.
- **Decision:** Updated — a visual's activity curve (`visual_activity_prepare`) is the timing authority for its sounds; sound-design owns the procedure. After retiming a visual with sounds, check them with `check.sound_element_ids` and correct them in the same card.
- **Verification:** Instruction walkthrough; tool behaviour verified as recorded in docs/tools/evolution/sound-effects.md. No model run of the revised skill yet.
