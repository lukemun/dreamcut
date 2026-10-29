# Storyboard workspace

Project → Storyboard lets a creator load footage, save source moments/ranges, and arrange selects before proposing a timeline edit. Footage is above the story strip; source preview and shot details open on demand. Library remains the owner of imported media and generation.

## Rows (freeform boards)

A freeform board is Media above one list of rows (`StoryRows`). Each row is a shot: its picture on the left (with any visuals over it) and its script on the right (`shot.script`, typed or dictated through `ShotNote`). Dragging a Media card between rows, or onto the end zone, adds a row (a video row starts as the whole video, a photo row as 3 s); dropping it onto a row's picture adds it as a visual over that row; the card's Row button adds one at the end without dragging. Rows reorder by their handle or the row menu (⋯), which also holds Transcribe, Split here, Trim and details (the Shot details panel) and Remove row.

A video row plays inline with sound. Transcribe (row menu; `POST …/storyboard/transcribe`, `src/lib/local-store/storyboard-transcript.ts`) runs the local whisper transcriber with `--words` on the whole video and returns timed words on its source clock. It is preparation only: results are cached by source hash under `instruments/storyboard-transcripts/` (a few KB each; the extracted audio is deleted), and the page saves the row's words (`shot.words`, those inside its source window) and script as one Undo step. While a transcribed row plays or is scrubbed, its script highlights the word being spoken (`spokenWord`, drawn on a copy of the text behind the field so the script stays editable). Split here (row menu) cuts the row where its playback is paused (`splitRowAt` in `src/lib/storyboard/rows.ts`) into two rows of the same video: a transcribed row cuts in the pause between words nearest the playhead and each part keeps the script spoken in it; an untranscribed row cuts on the frame and keeps its script on the first part. Visuals keep their moment in time. Whisper word timing is approximate: good for planning, not the MFA alignment that speech cuts on the timeline require. Script text is matched to the transcript by word count, so edits that add or remove words shift the highlight and the text split.

Boards following a reference video keep the panels described below (Script, Visuals, Reference, Canvas, Timeline).

`storyboard.json` is separate from `timeline.json`. Its revisioned content includes loaded source handles, marks, ordered shots, and contiguous named groups. Saved actions retain up to 50 Undo/Redo snapshots. Revision conflicts fail without overwriting another window. Undoing an import's workspace selection does not delete the imported source.

Ownership:

- `src/lib/storyboard/model.ts`: pure schemas, source validation, grouping and ordering.
- `src/lib/local-store/storyboard.ts`: project locking, atomic persistence and asset facts.
- `src/components/studio/storyboard/useStoryboard.ts`: serialized user commands and upload/preparation handoff.
- `src/lib/storyboard/compile.ts`: shared source-window and frame calculations for preview and proposals.
- `src/app/api/projects/[projectId]/storyboard/`: read/save/history, read-only source preview and Build timeline.

Source review uses the existing proposal derivation, composition adapter and owned player at the prepared video's dimensions. The page has no sequence playback; the assembled story is watched in the editor. Videos require a prepared preview and retain source audio. No renderer clock or effect implementation is duplicated.

Shots can carry visuals shown over them while their picture and sound continue. A photo or video visual floats in as a card beside the speaker (scale, offset and slide-up/fade animation, all ordinary clip fields) unless its placement is full frame. A motion-graphic render (`hyperframes/<id>/…`) keeps its own layout and alpha; its card shows it on its own (the drawn third when marked float). Media folds away once the story has shots; Script view shows each shot's line, on-screen text and a full-width row of its assets with when each appears.

Build timeline is the creator's action that writes the complete ordered sequence onto the timeline as a first assembly (decided 2026-10-12: a whole video is not a one-off tweak, so it is not a proposal). It derives through the same operation path as proposals and saves through the timeline write layer as one Undo step labelled "Build timeline from storyboard". A timeline with clips asks first, then appends after them; nothing is replaced. Planning notes and text ideas stay on the storyboard, not as rendered captions. Beat labels persist with the created visuals. Generated assets retain their Library provenance.

Duration and source start use shared scrub-number controls in seconds, with single commits and Escape cancellation. Selection, filter, collapsed groups and open panels are transient UI state. Photos start at half a second; whole video selections and point marks start with up to two seconds; range marks retain their selected duration. Build and source preview quantize the same values to 30 fps.

## Timeline and Canvas

The Canvas is the default panel for freeform boards; the Timeline panel (`MomentsTimeline`, in the Panels menu) lists one row per mark in board order, the frame at the mark (S/M/L set its height) beside what should happen there (typed, or dictated in the desktop app) and the effects joined to it. "Effect on all" gives every mark its own card for one template. Rows move earlier or later through their menu.

The Canvas panel (`StoryboardCanvas`, built on `@xyflow/react`) reads as a vertical timeline: moments down the left in board order joined by a drawn order line, each with its own effect and text cards beside it (an effect added to several moments is one card per moment); scrolling moves down the page and Arrange (`arrangeCanvasTimeline`) restores that layout. It shows the same marks and links as the Timeline: cards placed freely and joined by lines. A moment card is one mark (one card per mark; marking a clip adds its card, removing either removes both) showing its frame, number (M1…, board order, the same in a clip's Marks list), clip, time and note. An effect card names a Templates entry (`template:` id from `templateId`) with a note; a text card holds anything. Data lives in `storyboard.json` as `canvas {nodes, edges}` (`src/lib/storyboard/canvas.ts`); moves save on drop, and every add, line, deletion and move is one storyboard Undo step. Nothing on the canvas compiles to the timeline: the agent reads it through `storyboard_get` (a resolved graph) and assembles with the existing proposal and assembly tools; `storyboard_canvas_write` changes it. Selected cards are chat selection items.

Current boundaries: sorting uses workspace order, import time or name; capture-date extraction is not part of this implementation. Storyboard marks are source selects, distinct from review annotations on the working edit. Folder upload uses the existing upload API and supported image/video formats; failed items are reported separately. Source preparation status can be refreshed explicitly.

Regression tests: `src/lib/storyboard/storyboard.test.ts` covers group atomicity, source-window parity, stale-write rejection, Undo/Redo, preview compilation and the direct timeline build (stale refusal, confirm-then-append, unchanged source bytes). Shared UI and parameter gates remain mandatory. Independent usability acceptance must be recorded separately from an implementer's walkthrough.
