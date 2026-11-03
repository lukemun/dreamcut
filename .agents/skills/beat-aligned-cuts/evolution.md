# beat-aligned-cuts — evolution log

## Purpose

Turn the user's chosen musical attacks into inspectable, source-grounded visual timing, preserving musical intent, media continuity, saved choices, and human proposal approval. Success means the intended states land on the intended hits with explicit timing evidence and a playable review, not simply that every detected beat receives a cut.

## 2026-09-25

- **Observation:** In Scratchpad Layered Cutout, the user saved three drum hits and nine melody hits and requested a jump on each drop followed by three consecutive sprite frames. Existing music-direction covers scoring; visual-timing covers spoken beats. Neither owns musical-hit-to-visual-state mapping.
- **Decision:** Added a focused repository craft skill at the user's request. Distinguish applied marks from named snapshots, source time from clip time, and consecutive source frames from a sparse timeline subset. Keep the drop-plus-three pattern optional, preserve user-selected hits, and require proposal review for actual edits.
- **Verification:** Checked the live instrument payload: twelve applied marks, no named presets, with the middle melody group clicked out of chronological order. Reviewed projection and selection helper locations; validated skill frontmatter and links. No timeline edit or listening validation was performed as part of authoring.

## 2026-10-28

- **Observation:** Cutting "on the bar" or "to the drop" had no source: the rhythm map saved `downbeats: "unknown"` and no drop positions, and its tracker reports tempo in coarse steps (123.05 BPM for a 122 BPM house track, about 0.8 s adrift by its end). The owner asked to bring the beat-grid ideas from an external kinetic-type film skill (downbeats, drops, a fit to a stated tempo) into DreamCut.
- **Decision:** The rhythm map (schema 3) now records bar starts with a confidence, drops measured from the bass returning, and an optional `expected_bpm` fit. This skill uses them only when no hits are marked, says how to treat low confidence, a rejected hint and an absent drop, and keeps marked hits authoritative.
- **Verification:** Fixture tests with known bars and a known drop (tracked and hinted, with a wrong hint of 118 for a 120 BPM track), and manual runs on three catalog tracks: drops found where the bass returns on a "deep drop" track, none on two steady house tracks, and the constant fit rejected on the track whose tempo drifts between about 132 and 134 BPM. Not yet used for a real proposal; no listening check.
