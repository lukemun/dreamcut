---
name: storyboard-drafting
description: Break a creator's supplied footage (long talking takes, mixed clips, photos) into a reviewable storyboard of named beats and shots from their direction, with what happens, on-screen text ideas, transitions and visuals shown over talking shots. Use when they ask to storyboard, plan, outline or break up footage before editing. Not for edits to an existing timeline (open-edit-proposals) or Follow-reference beat matching.
---

# Draft a storyboard from footage and direction

Produce a storyboard the creator can scan, tune and undo: beats in story order, each shot a
window of an original source with a clear label, what happens, any on-screen text and the
transition into it. The board is planning. It never cuts media or changes the timeline;
the creator turns it into a first assembly with Build timeline.

## Inputs and authority

- Required: the footage in the project and the creator's direction, even if loose ("intro is
  just me, middle gets the glitch animation, end on the product").
- Record material direction first with `editing_feedback_record`, preserving their words.
- Write only when asked. `storyboard_draft` saves one storyboard revision; one Undo in the
  Storyboard page removes the whole draft. Use `mode: "append"` to add to an existing
  story unless they asked to start over.
- Unimported files: use [media-intake](../media-intake/SKILL.md) first. Unprepared video:
  poll `media_readiness`; a shot cannot reference a source that is still preparing.

## Procedure

1. `storyboard_get` for the revision, the existing story and each source's kind, duration
   and readiness. Read personal style with `editing_memory_get`.
2. For speech, run `speech_prepare` and plan from the transcript: one shot per complete
   thought, starting and ending on word boundaries in natural pauses. Do not split
   mid-word or mid-phrase. A long take becomes several shots of the same source.
3. Map the direction onto beats. Name beats by story role ("Hook", "Product reveal").
   Where they named a treatment, say it in that shot's `note` (for example "glitch
   animation over the reveal") and put the planned transition in `transition_into`.
   Do not invent treatments they did not ask for; mark suggestions as suggestions in the note.
4. Visuals for spoken points go on the talking shot as `visuals`, never as separate shots.
   A screenshot, mockup, B-roll clip or motion graphic shown while they talk is a visual
   over that shot: `at` is seconds from the shot's start, `duration` how long it stays,
   and `start` the in-point for a video. Time each one to the words it illustrates from
   the transcript. Visuals stay inside their shot in time order without overlapping; the
   shot's picture and sound continue underneath, so the speech is never cut. A separate
   photo shot would replace the talking audio. Use a separate shot only when the speech
   should actually stop.
   Screenshots and mockups float in as a card beside the speaker by default; use
   `placement: "full"` only for title cards and section breaks that should take over the frame.
   For a designed graphic (title flash, section header, chart, counter), build it with
   `motion_graphic_prepare` and use its render (a `hyperframes/<id>/…` source) as the visual: it
   keeps its own layout on the timeline after Build timeline. Set `placement: "float"` on a graphic drawn
   beside the speaker so its storyboard card shows it legibly.
5. Check the picture before describing it: `source_evidence` at each shot's start and
   middle. The note says what is said (key line or paraphrase) and what is seen.
   Notes are for the creator: no capture timestamps, file paths or provenance
   ("Recorded …", "derivative of sources/…"). Put those in your report instead.
6. `storyboard_draft` with the revision. If it is refused as stale, re-read and redraft
   from the current board; never overwrite the creator's newer work.
7. Mark the recorded direction answered with `editing_feedback_disposition`, citing the
   saved revision, and run `editing_feedback_check` at closeout.

## Report

Tell the creator the beats and shot count, which points carry visuals, which parts carry
the treatments they asked for, and anything you could not ground (no transcript, unclear picture, unprepared media).
Say that one Undo removes the draft, and that Build timeline lays it onto the timeline as a first assembly (one Undo in the editor).
Do not claim the plan is a finished edit; timing and treatments are applied later in proposals.
