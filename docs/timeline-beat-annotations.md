# Saved rhythm maps

Implemented 2026-09-20. Select an audio clip and open **Properties → Rhythm**
(the slide-up panel in tall layout, or the side panel in wide layout). **Use rhythm
map across timeline** makes that clip the global rhythm reference. Rhythm is an open peer section beside Audio and Timing; Timing remains
in its existing position.
There is no dedicated timeline header row. Saved, category-colored ruler ticks remain when
Properties closes or a different clip is selected. Enabling a different reference
replaces the old one. Turning the toggle off hides ticks and disables beat snapping
without deleting the source annotation.

When enabled, the section offers explicit analysis if needed, marker navigation and
independent **Show** and **Snap** filters for the steady beat grid, estimated drums,
estimated synth/tonal attacks, and other detected hits. This lets the ruler show a
dense performance map while snapping only to the event families that matter for the
current visual treatment. The main timeline snapping switch and Alt bypass still apply.
The reference clip does not snap against its own grid. Source-relative annotation
is durable; reference selection, visibility and snapping are workspace session settings.

Analysis never runs on import, placement, playback, drag, or a read request. **Analyze
beats** (or MCP `beat_annotation_prepare`) explicitly prepares the annotation once; its optional `expected_bpm` (a tempo the
creator or the music's maker stated) fits a constant grid near that tempo and keeps it
only when it fits the track better than the tracked beats.
`beat_grid_get` reads saved analysis and returns its current clip-time projection of
beats, bar starts (`downbeats`) and `drops`;
missing analysis returns `annotation: null`. Both tools accept `project_id` and
`element_id`. Analysis does not edit timeline.json or authorize cuts. Agent edits
continue through the existing proposal contract.

Sidecars live in `projects/<id>/analysis/beats/`, keyed by source SHA-256 and detector
recipe/script fingerprint. Schema 3 (2026-10-28) records source duration, ordered source-time beats,
high-sensitivity onset hits, provisional HPSS-derived hit categories and confidence,
provisional tempo, analysis date, the tempo hint, whether beats came from the tracker
or the fixed-tempo fit, a grid strength (how much more pulse sits on the beats than on
the track's average moment), downbeats and drops. Downbeats assume 4/4: the bar phase
where the kick lands hardest and the harmony changes most, with a confidence. Drops
are bar starts where the next two bars are at least 9 dB louder in the bass (below
150 Hz) or 6 dB louder overall than the two before, at most eight, four bars apart;
the bar grid is extended over quiet intros the tracker skips. Schema 1 and 2 maps still
read and have no downbeats or drops until prepared again. One map is kept per source:
a new hint replaces it, and a request without one reuses it. Changing source bytes creates
a new identity. Reads validate the sidecar. Trims, moves, splits and speed steps only
reproject existing positions using the shared media clock; held frames have no beats.
No timeline schema migration is required. Original media is never modified.

Preparation requires ffmpeg, ffprobe and librosa in `.venv-music/bin/python`, or an
absolute `BEAT_PYTHON` override. Processing extracts the first audio stream locally,
limits sources to 30 minutes, uses bounded subprocess timeouts, and atomically saves
only complete successful results. Repeated concurrent requests for the same source
within a server process share work. Nothing is uploaded.

## Limits and verification

Meter detection (downbeats always assume 4/4), pickups and bar-length changes, source-separated
instrument recognition, manual tempo/bar corrections, showing bars and drops on the ruler,
automatic cuts, beat-cut QC, waveform coloring, library-wide batch annotation, and
cross-project cache sharing are not implemented. “Synth / tonal” means a harmonic-dominant
attack, not a proven synthesizer; mixed recordings can be mislabeled. Rhythm preparation
currently starts from a timeline clip.
The existing tracker can omit quiet intros/outros and select half/double tempo; a saved
grid is assistance, not proof of musical phrasing. No detected beat is a valid result.

Tests cover source hash invalidation, read-only cache misses, real local detection on
the synthetic 120 BPM fixture, repeated preparation, source preservation, trim/speed
projection, speed steps, holds, split boundaries, validation and snap targets.
Live UI checks cover explicit analysis, saved annotation reload, a real music track,
frame-aware beat seeking, both layouts, marker visibility, snapping controls and the help modal.
The browser reported a source-image decode warning and a Remotion license notice;
no beat-control errors were observed.
Actual drag/trim snapping remains a manual visual check; unit tests verify target selection.

Review checklist: select music → Properties → Rhythm → Use rhythm map across timeline;
Analyze rhythm if needed → check beat/drum/synth/other ticks; independently toggle Show and Snap;
Next/Previous shown marker; move/trim a visual clip with main snapping enabled
near a tick; reload and verify saved beats reappear without another analysis. No timeline edit is needed merely to prepare beats.
