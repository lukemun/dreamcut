# Jump Cuts — short poses into a spoken line

`pose_cut_sequence@1` is a native editing helper, not a promoted Templates card.
Supply the instructor's actual take and supplied click for a course recreation;
never substitute synthetic, unrelated or tutorial-preview footage. Verify hashes
and lesson mapping from FILE-READINESS/attachment receipts in local research.

Inspect each stationary/funny pose and a complete final spoken line with source
context from media-intake/source_evidence. Source marks remain an agent choice,
not an automatic action/speech detector. Keep practical handles and complete words.
The native demo starts with four pose windows8,4,6,4frames at30fps before the line;
the tutorial's initial six-frame experiment is not a universal default.

One proposal option uses operations[] empty and a pose_cut_sequence@1 block:
inputs.source has source_url/source_duration_seconds; inputs.poses is ordered
[{label,source_start_seconds,frames}]; inputs.line has source_start_seconds and
source_end_seconds for the complete phrase. Optional inputs.click has source_url,
source_duration_seconds, peak_seconds and its sound_effect_N lane key/index.
Use the actual imported paths and measured source clocks; no baked exports required.
Optional click.enabled_cuts is one boolean per change (including the final line):
measure which joins actually have a supplied sound. Omit it only when every join
is meant to click. Do not add a cue merely because a cut exists. Skipped cues do
not rename the remaining sound actors, and tails end at the next enabled cue.
All marks and timeline_start lie on the project frame grid. Every pose needs12real
frames from its chosen start to make the complete duration dial valid.

Each pose's Time on screen dial2–12frames preserves its source in-point and moves
all later clips and linked clicks together. No movement, freeze, fade or source
retime is added; original motion inside each tiny window remains live. First pose
control leads, others remain reachable. Click volume0–200% defaults45; Voice volume
0–200% defaults100. Intros are muted; the final line alone keeps original voice.
Click source peak must occur before the shortest2-frame cut; its actual loudest
source instant lands on each change. Sounds follow their visual. A sound tail ends
where the next click begins so one lane does not overlap; inspect/listen for abrupt
truncation and adjust preparation when needed. At volume0 the clips remain silent,
with stable identity and timings.

Validate ordering/source bounds, every join frame, beat spacing, mouth/voice
continuity, full words, click peaks, output duration and normal-speed playback.
Exercise all pose dials, volume/reset, Apply/Undo and reopen. Do not certify from
schema/tests alone. A reference-derived first take is not a fresh-input rebuild.
No public course media or catalog demo is bundled with this helper.
