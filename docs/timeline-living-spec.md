# Timeline Living Spec

> Source of truth for what the timeline editor supports, what's planned, and what's out of scope.
> This is an ongoing product/editor spec, not just a pre-implementation checklist.
> When implementation decisions are settled and intended to remain authoritative for agents, record them here.
> Updated: 2026-07-29

---

## Timing Model

- Each project has one composition frame rate: 24, 25, 30, 50 or 60 fps (`frame_rate` in metadata.json; absent means 30). `projectFrameRate` resolves it, and editing, preview, proxies and export all use it. Visual clips persist on that rate's frame boundaries. Times stay in seconds.
- Changing the rate (`output_format_set`, a proposal's `set_output_format.frame_rate` or the export dialog) re-snaps every picture clip to the new grid in the same undoable write (`requantizeTimelineForFrameRate`). Clips that touched still touch; captions and audio keep their exact times. Preview proxies re-prepare at the new rate, and the previous proxy plays until the new one is ready.
- Frame helpers default to the scoped project rate (`frame-rate-scope.ts`). The server sets it around each synchronous proposal derivation. The editor, render page, GPU worker and project scripts each set it once for their single project. Code that knows the rate passes it explicitly. NTSC rates (23.976, 29.97, 59.94) are not offered yet: they need drop-frame timecode.
- Already-frame-aligned values may be serialized to 3 decimal places without changing their recovered frame index at any supported rate.
- `.toFixed(3)` is therefore acceptable for display/transport of already-quantized timing values, but it is not the canonical quantization algorithm.
- Source frames are chosen on the 30 fps proxy grid. Preview decodes a proxy made with ffmpeg `fps=<project rate>`, which shows in slot *p* the last source frame starting strictly before `(p + ½) / rate`. Export decodes the original and samples it at that slot midpoint when the clip's proxy runs at the project rate (`src/lib/timeline/source-sampling.ts`), so preview and export show the same source frame at any source rate, including variable frame rate. Until 2026-10-10, export sampled at the slot start: a 29.97 fps clip exported one source frame behind its preview on almost every frame. `pnpm verify:source-frames` checks real Standard and GPU exports against the proxy.
- `trim_end` is a reversible source-tail trim, not a destructive source limit. A right-edge resize may consume that trim up to `(source_duration - trim_start) / playback_rate`; shortening the clip must leave the removed tail available for a later re-extension.
- Source-first trimming is the canonical edit model: mount the complete available source-backed clip and represent its visible interval with `trim_start` and `trim_end`. Do not create a new media file solely to bake an ordinary in/out decision. A pixel- or signal-changing derivative may be mounted only with provenance, original-source mapping, and practical source handles; its editorial in/out remains a timeline trim.
- Agent-created playable media must declare an absolute source-in, source-out, and full source duration. The editor MCP derives `duration = (source_out - source_in) / playback_rate`, `trim_start = source_in`, and `trim_end = source_duration - source_out`; it never hides a shorter source window behind `duration` with a null tail trim.
- Agent source-boundary edits are semantic head/tail trims. A head trim changes `timeline_start`, `duration`, and both source-handle fields together; a tail trim changes `duration` and both source-handle fields while preserving `timeline_start`. Partial raw trim patches are rejected by the MCP because they can act as an unsupported slip edit.
- The agent MCP is proposal-gated for existing working timelines: it exposes reads, instruments, and proposal creation/inspection, plus bounded `assembly_create` for a net-new first edit and `audition_create` for net-new source candidates. Both create a dedicated project only, refuse overwrite, and leave the working cut untouched; `assembly_create` also records the script, source inventory, visual directions, and delivery target as a durable brief. Direct mutation of existing timelines, history restore, and proposal approval/rejection fail closed through that transport. Direct mutation is granted in exactly one case — a project an agent assembly/audition flow created, marked `agent_workspace` in its metadata, where no human cut exists yet. That grant is a one-way latch cleared by the first human edit, and it never extends to approval, rejection, or history restore. Human approval remains an editor-UI action; when work cannot be represented by either bounded contract, the relevant contract must be extended before a timeline changes.

## Stable Decisions

### Local music catalog and platform variants

- The local editor has one shared, file-backed music catalog at `music-catalog/catalog.json` (or `TIMELINE_MUSIC_CATALOG_DIR`). Audio acquisition is not part of the catalog workflow.
- A catalog track represents one musical idea. It stores editorial guidance (mood, energy, tempo, textures, vocals, good/poor scenarios) and contains one or more versions.
- Cue windows belong to versions, not tracks. Each cue stores exact source start/end times, an editorial role, and use/avoid guidance because platform edits can have different timing.
- Versions record source status, delivery mode (`embedded` or `platform_native`), platform sound identifiers/URLs, and an optional local audio file.
- The asset shelf recommends a version from the project delivery target (`reels`/`feed` → Instagram, `tiktok` → TikTok, `shorts` → YouTube), but the user chooses the version and cue explicitly.
- Placing or replacing music persists the catalog track/version/cue and posting metadata in the timeline element props. Changing delivery target must not silently rewrite an existing cut.
- A version without a local audio file remains valid catalog knowledge but cannot be previewed, placed, or used to replace a clip. Platform-native versions are also metadata-only in the current phase, even if a reference file is present; select a separate embedded reference version for local editing.
- Platform-native references are not permission to rip or bake platform audio. Their identifiers exist so a later posting workflow can identify the in-app sound and cue accurately.

### Timeline-owned delivery truth

- The persisted timeline plus its lane metadata is the complete source of truth for every pixel and sample in a final delivery.
- An audible source must exist as a visible, active element on an unmuted timeline lane. A muted or removed element contributes no final audio.
- Do not replace, supplement, or resurrect timeline audio with a post-render mux, a prior delivery master, or an untracked external mix. A posting-ready file is the direct timeline render; copying those exact bytes to a stable deliverable name is allowed, changing its streams is not.
- If a processed audio derivative is required, mount that derivative on the timeline with its timing, gain, fades, provenance, and receipt before rendering. If a platform-native sound will be added during posting instead of baked into the file, keep its timeline record visibly labeled as metadata-only and ensure the rendered file does not contain it.
- Before handoff, compare active audio elements against muted lanes and the rendered stream inventory. The final-delivery receipt must bind the timeline revision and direct-render SHA-256; a later stream mutation invalidates that receipt.

### Workshop edit graph and media derivatives

- In a live workshop, visible timeline clips, splits, trims, and source handles are the authoritative edit graph.
  A cut is not correctly applied if its result can be heard but its retained source intervals cannot be inspected,
  adjusted, extended, or undone as timeline clips.
- Processed derivatives may optimize decoding, playback, color, audio gain, or rendering, but they are transport
  implementations attached behind the edit graph through explicit preview/render bindings and a source edit map.
  They do not replace the visible clips merely because one continuous file plays more reliably.
- A flattened active element is allowed only when a saved, versioned, discoverable proposal or effect graph in the
  UI exposes the editable source intervals and controls needed to change or recreate it, and the human explicitly
  approves consolidation. Spatial layout proposals are the model: a flattened preview is acceptable because the
  editable proposal remains authoritative and recoverable.
- Acceptance requires the cut to remain visible at its real boundary, its removed source to remain recoverable
  through handles or the edit map, and Undo/Redo to restore the prior project state. When preview performance
  fails, fix proxy, preload, decoder, or media-binding architecture without deleting the edit graph.

### Project aspect ratio ownership

- project aspect ratio is a project/timeline concern, not a style concern.
- Timeline preview and final video export must use the same project-level aspect ratio.
- Style reference generation may use portrait-oriented defaults such as `4:5`, but that reference aspect ratio does **not** control the project canvas.
- `style_selections.aspect_ratio` must be treated as style-reference metadata only.

### Timeline architecture at a glance

There are three layers in the current timeline system:

1. Persisted timeline state
- `timeline_elements` stores absolute clip timing (`timeline_start`, `duration`, trims, fades, lane assignment).
- `timeline_transitions` stores adjacency metadata only (`from_element_id`, `to_element_id`, `type`, `duration_seconds`).
- Adding a transition does **not** rewrite downstream clip timing.

2. Derived editor layout
- `src/lib/timeline/transitions.ts` validates that transitions only connect flush-adjacent visual clips in the same lane.
- That same module attaches transient `transition_in` / `transition_out` metadata to clips for downstream consumers.
- The editor still computes a tail-region transition span for canvas indication, but clip bounds remain fixed.

3. Render evaluation
- `src/lib/remotion/TimelineComposition.tsx` is where transition playback actually happens.
- For `A -> B`, the renderer creates a pre-cut render-only window over the last `T` seconds of A.
- In that window, A remains the base layer and B contributes a held first frame as the incoming overlay.
- After the cut, B starts from its normal `trim_start` inside its own unchanged clip span.

Keep those responsibilities separate:

- timeline persistence defines clip truth
- derived layout annotates clip relationships
- Remotion decides how transition pixels/audio are sampled

### Visual quantization

- Quantization applies to visual timeline spans for `still` and `video_clip`.
- Canonical quantization uses frame conversion helpers and nearest-frame rounding at `30fps`, not ad hoc decimal rounding.
- For visual clips, persisted `timeline_start` and `duration` must remain frame-aligned.
- For `video_clip`, persisted `trim_start` and `trim_end` are also treated as frame-aligned scalar values.
- For intentional flush joins such as split boundaries and duplicate end-to-start placement, both sides should reuse one boundary frame integer instead of relying on independent second-space rounding.

### Decimal serialization

- A frame-aligned second value can be serialized to 3 decimal places and later recovered to the same frame with `Math.round(sec * fps)`. The rounding error is at most 0.0005 s: 0.03 of a frame at 60 fps, well below the half frame that would change the frame.
- Reason: decimal rounding introduces at most `0.0005s` error, which is `0.015` frames at `30fps`, well below the `0.5` frame threshold that would change nearest-frame recovery.
- This makes `.toFixed(3)` safe for display, logs, transport, and optimistic UI values after quantization.
- It does not make `.toFixed(3)` a valid substitute for the actual quantization step.

### Minimum duration policy

- The editor enforces a shared minimum duration of `1` frame (`0.033s` at `30fps`) across all element types. The minimum is frame safety, not an editorial half-second floor.
- This is a broader editor policy.
- Frame quantization itself still applies only to visual clips unless another feature explicitly extends it.

### Frame ownership and seam debugging

- At `30fps`, every visible cut or transition boundary should land on an integer frame.
- Visual timeline coverage follows half-open frame ranges: a clip owns `[startFrame, endFrame)`.
- For a normal butt cut, continuity means `endA === startB`.
- In that model, no frame slot is unowned at the seam unless the editor intentionally creates overlap for a transition.

Current repo behavior:

- Visual span quantization is defined in `src/lib/timeline/frame-quantization.ts`.
- Render consumes those quantized spans in `src/lib/remotion/TimelineComposition.tsx` through Remotion `Sequence` mounting.
- A normal cut should therefore be frame-contiguous by construction.

Interpretation rule:

- If a black blip appears at a seam, do not assume timeline quantization created a missing frame by default.
- First inspect which source frame is being held or decoded at the boundary.
- Then inspect whether the source asset itself contains a black head/tail frame.

Debug order:

1. Verify seam ownership in quantized frame space.
2. Verify which frame the renderer freezes at the boundary.
3. Verify whether the media asset has a black first/last frame.
4. Revisit quantization only if frame ownership is actually discontinuous.

### Preview seam blips

Frame timing has been verified contiguous in quantized frame space, so black seam blips should not be blamed on missing timeline frames by default.

Settled SEV case:

- A black blip was observed when a `video_clip` entered a leading or trailing SEV hold region.
- Root cause: the SEV hold `Sequence` became visible without being premounted, so the frozen `<OffthreadVideo>` could miss its first visible preview tick and briefly show black.
- Fix: premount both SEV hold sequences with the same `premountFor` budget used by the playable clip body in `src/lib/remotion/TimelineComposition.tsx`.
- Result: the black blip disappeared for front and trailing SEVs once the hold sequences were premounted.

Still-open broader question:

- A more general Remotion Player preview blip at other hard `Sequence` boundaries may still exist and should be treated as a separate issue unless it reproduces through the SEV hold path specifically.

Attempted and rejected:

- A one-sequence-per-clip refactor was attempted for `video_clip` playback in `src/lib/remotion/TimelineComposition.tsx`.
- The idea was to reduce preview seam blips by collapsing head-hold / playable-body / tail-hold rendering into one full-span visual `Sequence`.
- In practice, preview quality got worse, not better.
- Premounting was still active in that experiment, so the regression was not caused by missing premount.
- Working conclusion: for the current Remotion Player behavior, reducing per-clip `Sequence` count is not automatically an improvement. Mount/compositing behavior inside the unified clip renderer can be worse than the current multi-`Sequence` approach.
- Status: reverted. Do not treat one-sequence-per-clip as the preferred next step without a materially different renderer design or fresh evidence.

### SEV — Still Extended Video clips

A **SEV** is a `video_clip` whose timeline duration exceeds its playable source media, producing frozen-frame "hold" regions at the leading edge, trailing edge, or both.

Hold segment math lives in `src/lib/timeline/media.ts` (`getVideoHoldSegments`, `getMaxPlayableTimelineDuration`).

Authoritative behavior:

- `duration` controls the full visible clip span on the timeline.
- The moving-video portion is limited by the playable source window.
- If `duration` exceeds the playable source window, the remainder is hold time, not additional revealed source media.
- A longer SEV therefore extends the visible clip and holds the last playable frame once the playable portion is exhausted.
- Playback speed changes the playable video portion by changing wall-clock playable duration; it does not directly create or remove hold regions except through the resulting playable-vs-total duration math.

Three render paths for the hold region (priority order):

Render path (simplified — single path per hold):

- **Leading hold:** `<Freeze frame={0}>` on the source `<OffthreadVideo>` trimmed to the first playable frame, inside a premounted `Sequence`.
- **Trailing hold:** `<Freeze frame={0}>` on the source `<OffthreadVideo>` trimmed to the last playable frame, inside a premounted `Sequence`.
- **Still elements:** `<Img>` of the source image directly (no intermediate still video MP4).

Previous multi-path fallback chain (`overflow_hold_still_video_url` → `overflow_hold_frame_url` → Freeze) was removed because the intermediate assets used different decoder pipelines, causing brightness mismatches. Using `<Freeze>` on the same source video ensures identical color space handling.

Timeline canvas draws a dashed yellow boundary line (black-outlined) at hold edges, with a tinted overlay and "Still" badge on the hold region.

### Color space pipeline

**Problem solved:** Still frames extracted from video or still images encoded to MP4 appeared at different brightness than the playing video. Root cause: BT.709 (video) and sRGB (images/web) use different transfer functions (gamma curves). BT.709 ≈ 2.4 gamma, sRGB ≈ 2.2 piecewise.

**Solution:** Standardized all hold rendering on `<Freeze>` + source `<OffthreadVideo>`, eliminating the color space mismatch entirely. The same decoder pipeline renders both the playing video and the frozen hold frame.

**ffmpeg encoding rules** (for any remaining asset pipelines):

1. Always tag video output with explicit color metadata (`-colorspace bt709 -color_primaries bt709`).
2. For sRGB source images, use `-color_trc iec61966-2-1` (sRGB transfer).
3. For video-sourced frames, use the `colorspace` filter with `fast=0` to ensure gamma-correct conversion.
4. Never rely on ffmpeg's implicit color space defaults — they vary by codec and container.

Applied in `src/lib/stills/video-generation.ts` and `src/lib/videos/frame-grab.ts`.

### Transition model — fixed bounds + pre-cut incoming overlay

This repo no longer treats visual transitions as overlap-by-shifting clip rectangles.

#### Page turns

- `page_turn` is a dedicated adjacent-visual transition for still pages and page-like frames.
- The pre-cut overlay renders the incoming clip fully and flat, then duplicates the outgoing boundary frame above it as a 3D sheet with distinct front and back faces. Horizontal still-image turns subdivide that sheet into chained narrow panels. Their angle follows a widthwise smoothstep profile, so curvature peaks through the middle third and eases to zero slope at both edges instead of folding at the loose edge. The back briefly carries a desaturated, paper-tinted copy of the outgoing frame. Video and vertical turns retain the cheaper rigid plane. Both variants rotate through 165° in a parent perspective context with face shading and a cast shadow.
- `params.page_curl` is a normalized `0..2` creative control for horizontal still turns. The transition inspector exposes it as a `Page curl` slider plus exact `0..200%` numeric field and reset; preview and export use the same clamped resolver. The default is `55%`.
- `params.page_turn_origin` selects `right-edge` (default) or `bottom-right`. The bottom-right mode keeps the page-turn travel right-to-left while adding an upward diagonal lift, roll, and bottom-weighted tilt so the curled sheet crosses the frame toward the top-left. Its still-page mesh uses overlapping diagonal trapezoid bands rather than visible vertical columns, with a stronger middle-third bow than the straight-edge turn. The transition inspector exposes the same choice as `Origin`.
- The transition must not reveal the incoming clip with a rectangular `clip-path`; doing so collapses the effect into a wipe.
- This is intentionally a deterministic 3D hinge, not a simulated flexible paper curl.
- Comic/image-page sequences remain normal editable still clips joined by transitions. They do not need to be flattened into a new source video or nested project before editing or export.

### Image-sequence-filled captions

- `image_fill` is a first-class caption style whose glyphs reveal an ordered list of project or remote image URLs.
- The renderer cycles the sequence using caption-local elapsed time, crossfades adjacent images, and applies a small alternating pan. The text remains editable and supplies the mask geometry. An optional ordered list of caption-local image-start times overrides the uniform hold scheduler so visual changes can land on irregular audio transients. The last scheduled image holds through the remaining caption instead of looping.
- The Inspector exposes the image order, optional audio-sync change-time list, hold time, page-change mode (hard cut, dissolve, or directional slide), transition duration, an opening-only clean-cut override, slide direction, slide motion blur, fill zoom, and signed image drift. The opening override protects a recognizable first image from beginning the global dissolve before the first scheduled audio cue; later changes retain the chosen page-change treatment. A zero drift holds each page still; negative drift reverses its horizontal travel. Emptying the change-time list restores uniform Image hold timing.
- Project-relative nested media URLs are absolutized by the render pipeline just like primary clip sources, so editor preview and headless Remotion export use the same images.
- This primitive supports still-image sequences. Arbitrary video fill, nested compositions, flexible page curls, and a one-click title-sequence recipe are separate future capabilities.

### Perspective wordmark camera reveal

- `camera_reveal` is a first-class caption style for a camera-pullback title treatment. It is not an opacity-switched SVG mask or a CSS scale imitation.
- The renderer creates one Three.js scene through `@remotion/three`: a real perspective camera looks at a full-frame black plane whose editable wordmark alpha reveals the ordered image sequence. The plane and letter mask exist from the first frame.
- The camera starts close enough that its view is physically contained inside one broad glyph region, then dollies backward while its target converges on the wordmark center. Letter edges therefore enter the frame through perspective instead of appearing in a one-frame matte swap.
- Temporal camera motion blur samples the same frame-driven Three scene through fixed `Freeze` layers. All sample canvases mount before playback, remain visually dormant through the opening hold, and keep a constant layer count; do not use `CameraMotionBlur`'s frame-zero sample ramp here because mounting additional WebGL canvases during playback exposes a transient black clear frame that does not exist on the timeline. Shutter angle and sample count are editable; the live editor warns through control copy that higher sample counts increase preview cost.
- The wordmark is true extruded `TextGeometry`, not sampled alpha planes. Each line is a continuous polygon mesh with physical Z depth, curve segments around glyph contours, and eight bevel segments around outer contours and counters. The moving montage material is selected by the front-facing normals; bevel, side-wall, and rear normals receive the mirror material. A small editable camera orbit exposes the walls in perspective.
- Two-line wordmarks normalize each line against its own measured glyph bounds so both lines have the same visible Y height. Their natural width difference remains intact; changing the shared font updates both lines.
- The Inspector exposes font weight, image framing (`Fill wordmark` or screen-relative `Follow camera`), an opening hold, start time, pullback duration, start/end distance, initial target X/Y, settled wall-view orbit X/Y, field of view, easing, shutter angle, blur samples, montage order, image hold, crossfade, fill zoom, pan, extrusion depth, bevel width, wall-light strength, mirror reflectivity, and wall colour. Camera easing includes named presets plus a variable-length time/progress spline. Editors can double-click or use Add point to create an interior keyframe, remove selected interior points with Delete/Backspace or Delete point, move points in time/progress, drag incoming/outgoing Bézier handles, and link or break those handles. The first and last points remain fixed. Each keyframe persists normalized time, progress, relative handles, and link mode; handle bounds keep every segment monotonic so camera progress cannot reverse. `Slow in the middle` uses a deliberately gentler speed contrast than the original five-point proof. Editing switches the preset to `custom`, and a pointer gesture commits one history entry on release. Legacy cubic-Bézier and fixed-five-point projects migrate into generated smooth handles when explicit keyframes are absent. `Follow camera` keeps the source image fitted to the current camera viewport while the physical glyph mask pulls away, so a close opening can show the whole composition instead of a tiny crop. Mirror walls retain a pale metallic base and add narrow environment-style reflection bands; they must not achieve “depth” by falling to a flat charcoal rear face. Preview and export resolve all values through `resolveCaptionProps`.
- The optional brand-card resolve is authored on that same glyph mesh. Its background colour begins replacing black first while the montage continues inside the letters; the solid wordmark colour follows and completes later. Resolve mode, start, duration, background colour, and wordmark colour are editable Caption Inspector properties. Do not implement this ending as a second text layer or a card cut, because either path can expose a one-frame geometry mismatch.
- Caption Inspector controls are split into navigable Content, Layout, Look, and Motion/3D Reveal subpanels, with Text design and Clip settings as the parent split. The vertical Inspector must not require horizontal scrolling or one continuous all-controls scroll.
- Image-sequence color ordering separates deterministic measurement from editorial intent. Per-image OKLCH lightness, chroma, and hue are L1 extraction; set ranges and continuity are L3 analysis; bright → cool → bright ordering is an L4 recommendation tied to the stated energy goal. A project-local audit receipt records the applied sequence and its level map.

Canonical model:

- Persisted clip timing does not move when a transition is added.
- `timeline_start` and `duration` remain authoritative for both clips.
- The incoming clip does **not** start earlier.
- The incoming clip does **not** end later.
- Downstream clips are unaffected.

For a transition `A -> B` with duration `T`:

- The cut boundary is still `A.end === B.start` in frame space.
- During the pre-cut window `[A.end - T, A.end]`, the renderer samples clip B early as a render-only overlay.
- That overlay uses clip B's **first visible frame** as a held image.
- Clip B's held first frame is rendered **above** clip A during that pre-cut window.
- After the cut, clip B starts normal playback at `B.start` from its normal `trim_start`.
- This means the first frame of B may be visible twice:
  - once as the pre-cut held overlay
  - again at the start of B's normal playback

Important implications:

- This is **not** source-handle reveal.
- This is **not** ripple editing.
- This is **not** the old overlap model where B was shifted left and its rendered duration was grown.
- The overlap exists in composition only, not in persisted clip timing.
- Consecutive transitions do not consume one another's duration budget: `A -> B`
  renders in A's tail, while `B -> C` renders later in B's tail. Validation
  must not shorten either transition merely because B participates in both.
- A transition may occupy all but one frame of either adjacent clip. The
  transition itself still keeps the shared three-frame minimum, while the
  one-frame body preserves a stable visible owner at the cut cadence.

Implementation rule:

- Shared transition metadata still lives on `timeline_transitions`.
- Derived visual timing lives in `src/lib/timeline/transitions.ts`.
- Visual render evaluation lives in `src/lib/remotion/TimelineComposition.tsx`.
- Timeline canvas should present fixed clip rectangles, not fake overlap.

Why this model was chosen:

- It avoids ripple-edit side effects on later clips, captions, beat markers, and audio.
- It keeps persisted clip timing easy to reason about.
- It matches the product need better than a handle-reveal workflow.
- It lets transitions work on stills and SEV-backed video clips without requiring hidden source media.

### Transition audio policy

Incoming transition boundary holds are visual-only.

For a transition `A -> B`:

- Outgoing clip A audio fades down during the pre-cut transition window.
- Incoming clip B contributes **no** audio during the pre-cut held-frame overlay.
- Clip B audio starts once, at `B.start`, from normal `trim_start`.

This avoids:

- duplicated incoming audio
- pre-revealed dialogue/music
- audio drift caused by trying to preview B audio before the cut

### Transition selection and canvas indication

Current UX is inspector-driven, not chip-driven.

- Selecting a clip opens the bottom inspector/menu for that clip.
- If the selected clip has an outgoing transition, that transition is edited from the selected clip path.
- There is currently **no visible transition chip** on the canvas.
- Instead, the canvas shows a full grey overlay rectangle over the last `T` seconds of clip A when that clip is hovered or selected.
- That grey tail-region overlay is the visual indicator for where the transition happens.
- Transition creation/editing therefore lives in the inspector, not direct canvas manipulation, in the current phase.

### Remotion Player preview constraints

The editor preview currently uses `@remotion/player` mounted by `src/components/studio/timeline/TimelinePlaybackShell.tsx`, with `src/lib/remotion/TimelineComposition.tsx` as the live composition.

Current behavior:

- Visuals, embedded video audio, and captions are previewed through the Remotion composition used for export
  logic. Standalone narration, music, and SFX are previewed by the editor-owned persistent mixer described
  below; export continues to render those same elements through Remotion.
- Premounting is done per `Sequence`, not per logical clip.
- `getPremountFrames()` currently uses a `2s` base for stills and a `0.5s` base for other media, then takes the max of that base and the element's fade durations.
- SEV holds and transition overlays therefore rely on the premount budget of the specific `Sequence` they live in.
- This per-`Sequence` premounting model is currently the better-known working path for SEV playback in the Player.

Implication:

- The preview can still feel glitchy at hard `Sequence` boundaries even when frame timing is correct.
- Treat this as a live-player mount/compositing issue first, not automatically as a timeline timing bug.

#### Preview audio topology and clock policy

All media branches resolve preview audio through one policy; a renderer branch may not independently infer
that a source should use Web Audio.

- The Remotion Player remains the authoritative visual frame clock and sole public transport.
- `TimelinePreviewAudioMixer` owns standalone timeline audio in review. It creates one persistent
  `HTMLAudioElement → MediaElementAudioSourceNode → GainNode` channel per element ID and one shared master
  gain. Frame, seek, play, pause, rate, volume, and mute events from the Player drive that mixer.
- React development effect replay must reuse the existing `MediaElementAudioSourceNode` for the same
  mounted `HTMLAudioElement`; browser Web Audio permits only one source-node creation per media element.
  Defer engine disposal through the replay boundary, while a real unmount still closes the shared context.
- Timeline timing, trim, rate, fade, envelope, and gain edits update channel metadata in place. Only changing
  an element's source URL replaces that channel. Remotion's pooled audio tags are not mounted for standalone
  preview audio, so a timing edit cannot recycle a formerly disconnected Web Audio owner.
- `externalAudioPreview` is an editor-only composition input. It suppresses standalone Remotion audio only
  when the composition is running in the Player; `isRendering` always restores the authored Remotion audio
  graph. The timeline therefore remains the single export source of truth.
- Native HTML media is the default review clock for video-backed narration embedded in visual clips.
  Local/same-origin URLs are Web Audio eligible, but source eligibility alone is not a selection reason.
- An audible video normally mounts a timing-identical `preview_audio_source_url` as the sole native narration
  clock while the picture proxy is muted. Above-ceiling speech gain is baked into that derivative and declared
  with `preview_audio_baked_gain`; narration that still requires Web Audio blocks review handoff.
- A verified `single-muxed-picture-and-baked-narration-clock-v1` is the only fallback when a measured
  seek-plus-play probe proves the separate native clock stalls while picture advances. Its receipt binds the
  proxy hash, packet-copied picture, baked gain, unity element gain, and preserved duration/timing.
- A processed clip derives its preview clock from that exact processed media. Splits, trims, rate changes,
  stitching, or cleanup never inherit an unrelated parent audio clock.

#### Interactive audio mutation lifecycle

The mounted Remotion Player owns transport state. The editor mixer observes its public events; it never creates
a second transport. An audio edit updates composition inputs and persistent mixer channel metadata in place; it
must not remount the Player, stop playback, or relocate the playhead.

Agent-selected audition audio enters the real timeline as a proposal `create_audio` operation. The operation
binds a stable element id, full source duration, and absolute source-in/source-out seconds; preview and approval
derive duration and tail trim from those boundaries. This lets the user preview and tune placement or gain
without turning a source-window selection into a destructive slip edit.

An editor-mixed standalone audio channel has one playback identity: element ID plus source URL. Timeline start,
duration, trim bounds, playback rate, gain, fades, and `props.volume_envelope` are mutable channel metadata and
must not replace its media element or Web Audio node. A source URL change replaces only that channel. Embedded
video narration retains its native-versus-Web-Audio topology identity because it remains inside Remotion.

Player buffering state belongs to the media node that emitted `waiting`, not to the whole editor indefinitely.
Pause and seek clear that ownership, and Player frame advancement clears a stale wait after a timing edit
replaces its media node. A genuine stall keeps the same frame and therefore remains visibly buffering.

For gain state, a valid `props.volume_envelope` is the renderer's absolute-gain authority; scalar `volume` is
the fallback when no envelope exists. Editor envelope writes synchronize scalar `volume` to the opening
envelope value so the fader, metadata, topology resolver, and renderer do not report different gains. Coding
agents must use the shared volume-envelope helper or patch both fields coherently rather than editing one side
of this pair.

The Basic inspector exposes a diamond beside Volume for playhead-local automation. Toggling it adds or removes
an interior `volume_envelope` point at the selected clip's local playhead time through normal timeline history.
When the playhead is on an existing volume point, the fader displays and edits that point rather than shifting
the entire envelope. Required endpoint points remain intact, and every toggle or value commit participates in
the same undo/redo path as other element mutations.

The regression gate for this lifecycle is:

```bash
pnpm verify:audio-volume-replay --project <project-id> \
  --element <audio-element-id> --volume <same-topology-test-gain> --port <editor-port>
```

The command clones the project into a temporary fixture and exercises the user-visible sequence: play the
audio, seek backward, change gain, allow in-place revision reconciliation, and replay without navigation or
refresh. Both passes must show the target media clock advancing; the receipt also records played-range growth
and whether the native/Web Audio topology changed. Run it once with a gain that remains on the original side
and once with a gain that crosses the boundary when the change touches topology selection. The identity unit
contract separately proves that same-topology gain preserves the node key while a topology crossing changes it.

Continuous fader auditioning uses a separate editor-only preview-gain store keyed by element id. Pointer-move
updates do not enter `TimelineStep` draft state, create history, write the timeline, reconcile a revision, or
rerender the full composition. Only the subscribed audio-track component receives the transient gain; release
commits one normalized timeline mutation and retains the preview override until that mutation resolves. This
keeps the audible level continuous across the preview-to-persisted handoff.

The audio node's persisted topology stays locked for the duration of one fader gesture. A native node previews
at no more than unity even if the pointer crosses above 0 dB; release may then perform one intentional
native/Web Audio topology change. Repeated topology switching during pointer movement is forbidden because it
replaces the media clock and produces playback stutter.

Transient gain is a leased interaction state, not a second durable volume authority. Cancelled pointer
interactions, inspector unmount, selected-element changes, window blur, and page hiding must clear the lease and
fall back to the persisted envelope/scalar gain. A stranded zero-gain preview override can otherwise leave a
healthy, fully loaded media clock completely silent until reload while the Inspector still shows the correct
saved dB value. The editor debug probe exposes read/set/clear/clear-all operations so this failure can be
distinguished from a saved mute without altering timeline data.

The regression gate for active fader playback is:

```bash
pnpm verify:audio-live-gain --project <project-id> \
  --element <audio-element-id> --low <gain> --high <gain> --port <editor-port>
```

It clones the project, starts inside the target clip, drives at least 60 transient gain changes during three
seconds of active playback, and measures Player-clock ratio, media growth, rewinds, buffering, longest stall,
and main-frame navigation. Run it for a native-clock element and a Web Audio element when audio fader,
composition assembly, preview gain, or audio topology code changes.

`preview-readiness` is the static gate: it verifies source readability, topology receipts, native-clock speech,
timing parity, format limits, decoder fanout, and render-authority/proxy identity. For an element that declares
`props.render_authority_source_url`, the gate normalizes cache-busting query parameters and then requires it to
identify the same media as `source_url`; when authority or preview SHA-256 fingerprints are declared, the
mounted files must match them. A `source_url`-only replacement is a blocker because export would use the new
asset while workshop playback could remain on the old `preview_source_url`. It does not prove that live playback advances. Audio handoff
also requires a sound-enabled continuous-play probe across a named source-mapped boundary. Measure Player-clock
advance against wall time, count `waiting`/`resume` pairs, identify active audible nodes, and confirm the played
range grows. A repeating sub-second range, recurring wait/resume loop, multiple clock owners, or materially
sub-real-time advance fails review even when the static gate passes.

The executable gate is:

```bash
pnpm verify:audio-playback --project <project-id> \
  --at <boundary-seconds> --name <boundary-name> --port <editor-port>
```

If `--at` is omitted, it selects the first flush boundary between audible video clips. The JSON receipt is
written under `projects/<id>/preprocess/continuous-audio-playback/`. Server unavailability and an invalid
headless animation environment fail before playback and are not misreported as audio regressions.

`verify:audio-playback` proves continuous playback across a named timeline boundary. It does not substitute for
`verify:audio-volume-replay` when code changes audio controls, reconciliation, media identity, or native/Web
Audio selection; those features must pass both gates. `verify:audio-live-gain` is additionally required when the
change touches fader preview or active-playback gain updates.

Audio element types must also use visible editor lane families: narration `audio_*`, music `music_\d+`, and
sound effects `sound_effect_\d+`. Creation and movement reject incompatible lane keys. The composition being
able to play an element is not proof that the editor can display and manipulate it.

### Source-addressed media context

Analysis belongs to source content rather than individual timeline clips. The canonical identity is the
source SHA-256, and all observations use original source seconds plus an explicit source coordinate space.
Timeline elements retain `props.media_context_ref` and project their trim/rate/spatial transform into that
shared context. Splits and trims therefore create new views over one record instead of copying analysis.

The global preprocessing manifest and append-only context dataset index live together under
`projects/.cache/media-analysis/<sha256>/`; projects hold asset bindings and project-specific annotations.
Only L1 source observations and L2 per-source derivations may enter the shared context. L3 rollups and L4
editorial guidance remain separate. The storage, provenance, query, and level-map boundaries are summarized in
the [spatial evidence architecture](./spatial-evidence-architecture.md).

### Preview proxy preprocessing

The live Player and the delivery renderer have different media budgets. High-resolution/high-bitrate SDR
camera originals may remain delivery authority, while preprocessing creates a lightweight proxy for
interactive decoding before the source is placed on a workshop timeline.

Required proxy properties:

- browser-decodable H.264/AAC MP4 with fast start and `yuv420p`
- CFR at the composition frame rate, with duration and frame-cadence parity to the original
- aspect/orientation preserved within a 1280×720 landscape or 720×1280 portrait envelope
- layered alpha motion uses VP9 WebM with `alpha_mode=1` and a tighter 540×960 portrait envelope;
  alpha layers commonly overlap presenter footage and other animations, so the generic video budget is
  insufficient for stable narration playback
- area/low-pass downscaling rather than a sharp reduction filter; Player/CSS resizing is a second
  resampling stage, so sharpening fine repeated detail can create moiré that is not in either master
- a source→proxy manifest keyed by source fingerprint and proxy-recipe version
- a versioned proxy URL so browser media caches cannot retain an obsolete encode

HDR/HLG/PQ footage must not produce an independently tone-mapped preview. Preserve the camera original as
archival provenance, create one full-resolution SDR BT.709 render authority through the approved native
color-management path, and derive the workshop proxy from that authority. Persist the authority in
`source_url` and the proxy in `props.preview_source_url`. Both derivatives require explicit BT.709 tags,
equal duration/frame count, and distributed decoded-frame parity measurements before grading begins.

The preview frame itself must remain square-cornered. Editor chrome may be rounded, but clipping the
Player makes a UI mask look like part of the footage and obscures the true composition boundary.

Status as of 2026-07-24: the file-backed editor resolves `props.preview_source_url` only during workshop
playback and renders `source_url`. `pnpm color-managed-video -- ...` creates paired Apple HDR→SDR authority
and preview derivatives. `pnpm animation-preview-proxy <project-id> <element-id...>` creates a
source-fingerprinted silent workshop proxy for an existing timeline element, verifies cadence, frame count,
duration, dimensions, and alpha preservation, writes a deterministic receipt and run metric, then mounts the
proxy without changing the render authority. When replacing that authority, update `source_url` and
`props.render_authority_source_url` together before invoking the command; preview readiness rejects a
split-brain identity or stale declared fingerprints. `--all-oversized` retrofits every active video above the current
workshop budget. General ingest still does not mount every proxy automatically.

### Waveform peak preprocessing

Waveform bars use a compact `2,000`-sample max-amplitude derivative. The media-analysis worker derives
`waveform_peaks` from its mono 16 kHz PCM16 `audio_pcm` stage with recipe
`mono-pcm16-max-2000-v1`, stores the source-fingerprinted artifact in the stage cache, and publishes the peaks
to the project's existing `peaks.json` under the project mutation lock using the canonical media URL.
Proportional bin boundaries must cover the complete source, including a non-divisible final bin.

The browser extractor remains a non-blocking fallback for eligible audible assets that have no persisted peaks.
It uses the same complete-source binning and clamps decoded float samples into the persistence schema. Missing
or corrupt preprocessing evidence therefore costs one browser decode but never blocks playback. It decodes
before requesting a running output clock so autoplay permission cannot strand waveform loading; failed decodes
remain retryable instead of being suppressed for the rest of the editor session. A fully
preprocessed project must not fetch and decode whole audio files in the browser merely to draw waveforms.

Peak pipeline level map: source PCM samples are **L1 extraction** from one audio artifact; the fixed-bin
max-amplitude waveform is **L2 per-item analysis** over that extraction; `peaks.json` is the persisted L2
artifact keyed by source identity. Waveform display is a consumer of L2 evidence, not guidance, and changing
the binning rule must never require reacquiring the source.

### Render bundle reuse

CLI and API renders use the same Remotion composition and full-resolution source-authority gate. Composition
bundling is source-fingerprinted over editor source, public assets, and build configuration, then cached under
`.cache/remotion-bundles/<fingerprint>`. A valid cache entry requires both the bundled `index.html` and a
matching versioned receipt. Cold builds write to a unique temporary directory, publish by atomic rename, and
serialize same-fingerprint builders with a reclaimable lock. Separate CLI processes may therefore reuse an
unchanged composition bundle without reusing timeline data, input props, browser state, or rendered output.
Any source/configuration change produces a new fingerprint. This is a render-setup optimization only; render
queueing, cancellation, frame concurrency calibration, and output supersession remain separate work.

### Custom moving cutout preprocessing

Opaque project videos can generate a synchronized transparent foreground asset from **Assets → Videos →
Cut out**. The user chooses a source interval and prompt frame, clicks positive object points, and may
Shift-click negative background/exclusion points. A project-local SAM 2 process propagates the matte and
encodes an audio-free `yuva420p` VP9 WebM. The source is never overwritten.

The source fingerprint, interval, prompt frame/points, source cadence, output cadence/frame count, alpha
mode, output path, and evidence directory are persisted in
`instruments/media-index/custom-cutouts.json`. The shelf uses that receipt as the generated asset's duration
authority and labels it **Cutout**. Placement writes `props.has_alpha: true`, so the existing Player and
Remotion render paths composite it transparently. Review remains mandatory in Base, Matte, Cutout, and
Composite modes because point-prompt tracking can drift on occlusion or fine fingers.

### Linked HyperFrames motion compositions

HyperFrames is an animation sidecar, not a second timeline authority. Editable HTML/CSS/GSAP compositions
live under `hyperframes/<composition-id>/` in the project. After `check` and Studio review, the explicit
approved-render command emits a content-addressed transparent high-quality WebM into
`media/hyperframes/<composition-id>/` and
a versioned receipt into `preprocess/hyperframes/`. The command never mutates `timeline.json`.

The receipt binds the render to a sorted source-tree fingerprint and records output checksum, duration,
dimensions, cadence, codec, pixel format, alpha evidence, HyperFrames version, quality, timestamp, and approval.
The asset shelf ignores missing or invalid receipts and only maps `alpha_mode: "1"` outputs to **Cutout**.
Placement writes `props.has_alpha: true` plus composition ID, source directory and fingerprint, receipt path,
and render-authority checksum. Remotion owns compositing and the final video render exactly as it does for other
transparent WebM assets.

Recurring transform motion belongs natively in Timeline instead of being baked through this sidecar. The
Inspector's Float, Bounce, and Orbit presets compile to ordinary clip-local horizontal/vertical keyframes,
close exactly at the clip boundary, remain editable after application, and commit as one history entry.
Agent `create_visual` proposals may request the same named presets and preview the resulting native keyframes
before approval. HyperFrames remains the correct path for bespoke DOM/CSS/SVG/GSAP animation that cannot be
expressed by Timeline's typed element and keyframe primitives; frequently reused sidecar recipes should graduate
into native primitives rather than creating a second user-facing editor.

Native motion-graphic assembly is primitive-first. One semantic source represents one independently meaningful
object; repeated people, logos, cards, or icons reuse that source through separate timeline elements. Each instance
owns its position, lane, timing, and animation. Joined stills containing multiple copies are allowed only when the
copies are intentionally inseparable as one editorial object, not merely to make initial assembly faster. This
keeps entrance order, spacing, keyframes, and later user changes editable without regenerating media.

Talking-head derivatives are source-clock views, not independently timed overlays. The `sync_speech_visual`
proposal operation verifies the cutout receipt against an active audible source element and common source hash,
then derives the cutout's timeline start, retained trim, duration, and playback rate from one absolute source
window. Approval persists that binding and rejects later generic timing patches; layout and lane changes remain
independent. Force-aligned captions bind to the same speech element and source clock. Once dependencies exist, a
proposal may change the master speech clock only when every linked talking-head view is re-derived afterward and
the complete source-bound caption rail is replaced in the same option. Partial clock changes fail closed, keeping
audible words, visible mouth motion, and caption cues synchronized after speed, trim, or cut changes.

Evidence level map: source and output hashes plus ffprobe facts are **L1 extraction**; validated receipt →
Cutout/alpha classification is **L2 per-item analysis**; timeline placement is authored editorial state; usage
recommendations are **L4 guidance** and do not belong in preprocessing. Approved rerenders publish a new media
path, so they cannot silently replace a placed render authority. The refresh surface must show staleness and
require explicit adoption of another reviewed, approved render.

The implementation and staged UI plan are recorded in the
[HyperFrames timeline integration](./hyperframes-timeline-integration.md).

The Videos shelf owns the first-use controls. It lists draft and rendered compositions, derives Up to date / Changes
not rendered / missing states from source and receipt evidence, and offers Create, Open Studio, Check, and explicit
Approve and render actions. Successful actions refresh the visible collection in place. A render action always runs
Check first; a passing check is not approval, and no render button or API request may infer approval from it.
The local Timeline Editor is a desktop pointer/keyboard workspace with a supported viewport floor of 1024 × 720;
portrait describes the exported canvas, not a phone editing surface. HyperFrames controls must fit their actual
Library pane at that floor and at every wider audited desktop width.

The local workshop has typed `full` and `simple` workspace profiles. `full` is the default and retains every
workshop/review capability; `simple` remains a useful local review harness for the product capability boundary.
The shipped Videos editor is not an iframe into that file-backed process. It is an authenticated,
Supabase-backed production adapter with the same simple capability boundary: lanes, clips, audio, captions,
transitions, motion presets, preview, history, and export, without proposals, frame marks, continuity review,
preprocessing/layout/audition tools, keyframes, or advanced Inspector groups. Its assembly shell keeps Library,
preview, Inspector, and the timeline visible together. Selection and aspect-ratio changes update content without
moving those regions. The hosted profile uses fixed compact lane rows and does not expose lane creation, deletion,
reordering, solo, or lane-height controls; the full local profile retains those tools. The horizontal boundary above
the hosted timeline remains directly resizable so a short assembly does not reserve an oversized lane area. Its
Library is organized as Visuals, Audio, and Text with flat asset lists; Audio combines voiceovers, music, and sound
effects rather than exposing sub-tabs, and origin/approval metadata do not create extra browsing levels. Visuals and
Audio expose a contextual Upload action; Text exposes Add text and creates a selectable caption item. One compact
toolbar above the ruler owns Select, Split, Snap, Undo/Redo, Fit, zoom, aspect ratio, and fullscreen. The hosted
surface does not show Auto-place or a second transport row; preview playback remains on the player.

While this hosted UX is under development, `video_assembly_workspace` is an admin-only feature flag. It must not be
listed as a self-service beta, accept user-scoped enable overrides, or bypass the resolver in local development.
Navigation hides the editor for non-admins, and the direct edit route redirects them to Videos. Local development
access uses the same server-owned administrator status as production rather than a development-only exception.

The hosted editor's application header is a compact 40px bar. It places the inline editable saved video name beside
the Videos return action and keeps Export at the right edge, without reserving an empty centered grid column. Rename
writes `projects.title` through an authenticated, RLS-backed update;
project collaborators retain update access through the project-sharing contract, and failed saves restore the last
persisted title.

The horizontal preview/timeline resize target renders as one visible 1px rule with a larger invisible hit area; it
must not appear as a bordered bar or double line. The hosted right inspector is a single-column narrow-panel layout.
It exposes only task-critical groups by selected type: Timing; Audio volume/fades and Trim for audible media;
Framing for visuals; Entrance/Exit Motion; Text/Font/Size/Effect and Top/Middle/Bottom placement for captions; and
Reset settings/Delete item. Advanced caption coordinates, lock controls, playback-speed controls, and motion-duration controls
remain outside the hosted first-use panel.

Both surfaces must preserve the timeline semantics in this spec even though their persistence adapters and
advanced UI differ. A production preview may use `props.preview_source_url`; authoritative export must ignore it,
refresh private storage URLs, and render `source_url`. Production uploads go browser-to-storage through a one-use
signed upload token, then finalize into the timeline document. New deterministic timing, transition, transform, or
render behavior belongs in shared timeline modules or a common package rather than being independently invented in
the two editors.

### Future improvement options for Remotion Player preview

If interactive preview quality becomes a product issue, stay on Remotion Player first and improve the composition before considering a different preview stack.

#### Layer fan-out performance gap

The composition currently mounts one `<OffthreadVideo>` for each active video timeline element. Elements
that share the same `source_url`, effective source time, and playback rate still create separate media
instances when they use different masks or transforms. A six-row split-face effect therefore mounts six
synchronized video instances even though it has only two unique source-time streams. Preview proxies reduce
the cost of each decode, but they do not remove this multiplicity.

Measured during the 2026-07-16 head-turn workshop: the selected effect required six simultaneous masked row
videos while several Codex/Chromium renderer processes consumed roughly 100–258% CPU and the dedicated Chromium
GPU process was about 14% at the same instant. This is a diagnostic snapshot, not a benchmark; Apple media
engine activity also does not map directly to Activity Monitor's GPU graph. It is sufficient evidence that
“turn on the GPU” is not an honest fix for the current layer model.

The next structural preview experiment should group compatible elements by
`source_url + source-time mapping/trim + playback rate + timeline phase + audio policy`, decode each unique
playback identity once, and fan the resulting
frame or texture into multiple masks/transforms (for example through a shared canvas/WebGL compositor). The
export path must remain frame-identical. Prove the change on a reusable layered-video fixture by recording
unique source-time streams, mounted media instances, achieved playback rate/dropped frames, CPU, GPU/media
engine evidence when available, memory, and preview/export parity. A proxy-encoder change such as
`h264_videotoolbox` is a separate benchmarked preprocessing optimization; it does not close this preview gap.

Priority order:

1. Premount tuning
- Increase premount windows for clips or transition-heavy media.
- Cheapest mitigation.
- Helpful for decode/mount timing, but unlikely to eliminate all boundary blips by itself.

2. Reduce `Sequence` churn inside `TimelineComposition`
- Previously considered as the preferred next structural improvement.
- A direct one-sequence-per-clip experiment was attempted and then reverted because preview quality got worse.
- Do not retry that same shape by default.
- Only revisit this category with a materially different renderer design and explicit preview testing.

3. Transition scope discipline
- Keep transition types simple if preview stability becomes sensitive.
- `fade` is the safest baseline.
- More complex motion transitions should be evaluated against Player stability before becoming default editor behavior.

Non-goal for now:

- Moving off Remotion Player for editor preview.
- Moving off Remotion for final render/export.

---

## 1. Transport & Playback

| Feature | Status | Notes |
|---|---|---|
| Play / Pause | **Done** | Toggle via bottom toolbar button |
| Skip to start / end | **Done** | ⏮ / ⏭ buttons in bottom toolbar |
| Playhead scrub | **Done** | Click/drag on ruler to seek |
| Frame step (←/→) | **Done** | Left/Right arrow = ±1 frame when a movable playback element or focused field does not own the key event |
| JKL shuttle | **Planned** | J=reverse, K=stop, L=forward; repeated press = 2x, 4x |
| Go to next/prev edit point | **Done** | Grouped transport buttons jump to the nearest active clip boundary across all lanes |
| Loop playback (In/Out range) | **Planned** | Mark I/O range, loop between them |
| Set In point / Out point | **Planned** | I / O keys to mark range |
| Playback speed indicator | Not planned | Low value for video editing |
| Audio scrubbing | Not planned | Hear audio while dragging playhead |

## 2. Timeline Navigation

| Feature | Status | Notes |
|---|---|---|
| Horizontal zoom (slider) | **Done** | Zoom scrub control and a labeled Fit action in the transport row, 25%–10000% (`MAX_ZOOM_LEVEL = 100`) |
| Vertical zoom (lane height) | **Done** | Lanes slider in toolbar |
| Zoom via Ctrl/Cmd+scroll | **Done** | Pinch-zoom anchored at cursor position |
| Horizontal scroll (shift+wheel / trackpad) | **Done** | Pans timeline left/right |
| Vertical scroll (wheel) | **Done** | Native scroll when lanes overflow container |
| Fit timeline to view | **Done (canonical local editor)** | Toolbar Fit button and Shift+Z; also runs automatically once per project load. Zoom 1 fits the whole duration horizontally by construction; the fit derives the largest lane scale (floor `MIN_LANE_SCALE`) whose lane stack + canvas chrome fits the measured viewport height (`resolveFitLaneScale` in `adapters.ts`), scrolls to start, and clears per-lane manual size deltas. The former Reset button became Fit. |
| Timecode display | **Done** | `0:08 / 0:45` in bottom toolbar |
| Timeline ruler with beat markers | **Done** | Beat labels shown in ruler row |
| Time ticks | **Done** | Every 5s on the ruler |
| Minimap / overview bar | Not planned | Low priority |

## 3. Clip Manipulation

| Feature | Status | Notes |
|---|---|---|
| Move clip (drag) | **Done** | Drag clips horizontally; cross-lane drag for visuals |
| Resize clip (drag edges) | **Done** | Left/right handles on clips |
| Resize clip (bottom duration input) | **Done** | Uses the same right-edge resize semantics and preview model as canvas drag-resize |
| Split at playhead (captions) | **Done** | Splits caption text + timing at playhead |
| Split at playhead (all types) | **Done** | Compound toolbar tool, clip context menu, and **S** shortcut |
| Select left/right of playhead | **Done** | Icon-only compound toolbar tools use **[** and **]** to select active items wholly to the left or right; split first to include the corresponding half of a crossing clip |
| Nudge clip start | **Done** | ◄/► buttons in inspector (±0.5s) |
| Change clip speed | **Done** | Scrub dial ◄ 1.00x ► with 0.01 increments |
| Delete (soft delete) | **Done** | Remove button; sets `removed_at` in DB |
| Ripple delete | **Planned** | Delete and close the gap |
| Duplicate clip | **Done** | Toolbar clip-action button and clip context menu; keyboard shortcut still planned |
| Disable / Enable clip | **Done** | Available from clip context menu; disabled clips are excluded from composition |
| Replace clip | Not planned | Swap timeline clip with different source |
| Slip / Slide / Roll edit | Not planned | Pro trim modes; overkill for short-form video |
| Rate stretch (drag to fit) | Not planned | Speed via drag edge |
| Freeze frame | Not planned | Insert still from video frame |
| Nest / Compound clip | Not planned | |

Resize policy notes:

- Shortening a clip preserves same-lane placement and may invalidate an adjacent transition if the clips no longer touch.
- Expanding a visual clip keeps the requested duration when possible by moving it to a free visual lane instead of clamping at the next blocker.
- If no open visual lane exists, the resize falls back to clamping at the next blocker on the current lane.
- Any transition invalidated by a resize or lane move is removed by transition revalidation; transitions are not preserved across lane hops.

## 4. Selection

| Feature | Status | Notes |
|---|---|---|
| Click to select | **Done** | Click clip on canvas to select + open inspector |
| Click playback caption to select | **Done** | Active editable caption text exposes a playback hit target that selects the same timeline element and opens its inspector |
| Deselect | **Done** | Click empty space or close inspector |
| Multi-select (shift+click) | **Done** | Shift-click toggles clips in the active selection; dragging a selected clip moves the selected set |
| Marquee / lasso select | **Done** | Drag empty canvas space to marquee clips; Shift preserves the prior selection |
| Select all | **Planned** | Cmd+A |
| Select all on track | **Planned** | Right-click track header |
| Track select forward | Not planned | Pro workflow |

## 5. Track / Lane Management

| Feature | Status | Notes |
|---|---|---|
| Auto-generated lanes | **Done** | Lanes created from element data (Visual 1, Narrator, Music, etc.) |
| Mute lane | **Done** | M button on lane sidebar; muted lanes are excluded from composition immediately without stopping active playback |
| Solo lane | **Done** | Available from lane-header context menu; toggling solo again restores all lanes |
| Lock element position | **Done** | Per-element lock checkbox in inspector |
| Lane labels | **Done** | Auto-labeled from type + character name |
| Lock all clips in lane | **Done (canonical local editor)** | Lane menu action batches `position_locked` across the lane's active clips as one undoable batch; the existing per-clip lock rules and "L" badges apply |
| Lane color coding | **Done** | Visual=amber, Audio=green, Music=purple, Captions=brown |
| Adjustable lane height | **Done** | Global slider; all lanes share same height |
| Add / delete track | Not planned | Lanes are auto-managed from elements |
| Reorder tracks | Not planned | Lane order is fixed by type |
| Rename track | Not planned | |
| Per-lane height | Not planned | All lanes share global height |

## 6. Audio Controls

| Feature | Status | Notes |
|---|---|---|
| Volume control (per element) | **Done** | Fader reads **dB, 0 dB = the clip as-is** (unity); mute at the floor, above 0 boosts. What the fader shows is exactly the stored linear gain — nothing is auto-leveled. Math in `src/lib/timeline/audio-gain.ts` (`gainToFaderDb`/`faderDbToGain`) |
| Enhance voice | **Done (primary speech action)** | **Enhance voice** runs pinned DeepFilterNet3 speech enhancement with a 0–100 strength control mapped to a bounded 0–30 dB attenuation limit, then applies conservative high-pass, presence, compression, and −1.5 dBTP limiting. It preserves picture packets, timing, and the original source; keeps preview/render on the same unity-gain derivative; records model/checkpoint/hash and before/after noise/loudness evidence; and exposes an Original/Enhanced authority switch for contextual A/B review. Default strength is 40% (12 dB maximum model attenuation) |
| Normalize audio | **Done (advanced, deliberate)** | Placing an audio clip only **measures** its integrated LUFS server-side (`ffmpeg ebur128`, cached in `audio-loudness.json`) into `props.source_lufs` — it never silently re-levels. **Normalize loudness** lives under Advanced audio because it changes the complete signal, not the voice-to-background ratio. When invoked, it creates a timing-identical, two-pass EBU R128 derivative at the role target (`ROLE_LOUDNESS_TARGETS` — narrator −16, music bed −28, sfx −18 LUFS) with a −1.5 dBTP ceiling, then keeps timeline gain at unity |
| Background-noise reduction | **Done (deliberate and reversible)** | **Reduce background noise** extracts a quiet-handle profile, applies a conservative full-source spectral gate capped at 15 dB reduction, creates a recipe-bound derivative with packet-copied picture, preserves the original source, and routes preview and render to the treated audio. **Restore original** switches authority back; normalization remains a separate action |
| Detach / reattach video audio | **Done** | **Detach audio** extracts a synchronized narration element onto `audio_narrator`, preserving start, duration, trims, rate, gain, and fades while muting both the video's scalar gain and volume envelope. **Reattach** restores the prior embedded gain/envelope and soft-removes the detached element. Proposal-created detached audio obeys the same one-authority invariant: a stabilization option that mutes embedded audio also zeros and preserves its envelope, and `reattach_original_audio` provides the reviewable reset path. |
| Waveform display | **Done** | Peak bars drawn on audio clips; updates with zoom |
| Fade in / fade out | **Done** | Numeric inputs in inspector (seconds) |
| Client-side peak computation | **Done** | Peaks computed in browser, persisted to API |
| Audio gain rubber band | **Planned** | Visual volume line on clip for drag adjustment. NOTE: envelope + inspector fader both operate in raw linear gain; the inspector just displays it as dB (0 = unity) |
| Audio meters (VU) | Not planned | Output level monitoring |
| Per-track volume fader | Not planned | |
| Audio ducking | Not planned | |

Audio-treatment pipeline level map:

| Field / artifact | Reads from | Level | Producer and recomputation cost |
|---|---|---:|---|
| Fixed-window RMS observations (`startSeconds`, `endSeconds`, `rmsDbfs`) | One decoded source audio artifact | L1 | FFmpeg decode; expensive relative to selection and repeated only when source identity changes |
| Selected `noise_profile` | One source's RMS observations | L2 | Deterministic quietest-window rule; cheap to re-derive when selection rules change |
| Recipe-bound noise-reduced derivative | One source plus its selected noise profile | L2 | Deterministic full-source spectral pass; recomputed when source, profile, or recipe changes |
| Loudness measurement (`input_i`, `input_tp`, `input_lra`, threshold) | One treated or untreated audio artifact | L1 | FFmpeg EBU R128 read; source-fingerprinted |
| Role target (`target_lufs`, `target_true_peak_dbtp`) | Loudness evidence plus the user-assigned audio role and leveling goal | L4 | Product guidance from `ROLE_LOUDNESS_TARGETS`; changing the target never changes source evidence |
| Recipe-bound normalized derivative | L1 loudness evidence plus the explicit L4 role target | L4 action output | Two-pass FFmpeg loudnorm; recomputed only after the user invokes Normalize for that source, target, and recipe |
| Neural voice derivative and checkpoint receipt | One source artifact plus user-selected strength and a pinned DeepFilterNet3 checkpoint | L4 action output | Model inference; source/model/strength fingerprinted, so changing strength reuses source evidence but creates a distinct reversible derivative |

## 7. Transitions & Effects

| Feature | Status | Notes |
|---|---|---|
| Opacity fade in/out | **Done** | Per-element fade_in / fade_out (visual=opacity, audio=volume) |
| Caption animations | **Done** | Per-caption animationIn / animationOut presets |
| Adjacent visual transitions | **Done** | Inspector-driven `fade` / `slide` / `wipe` / full-frame `whip` / `page_turn` between flush-adjacent visual clips in the same lane |
| Image-sequence caption fill | **Done** | Editable caption glyphs reveal an ordered still sequence with hold, crossfade, zoom, and pan controls |
| Transition timing model | **Done** | Fixed clip bounds + pre-cut incoming held-frame overlay; no timeline ripple |
| Transition canvas indicator | **Done** | Full grey overlay rectangle on the outgoing clip's tail when hovered/selected |
| Default cross-dissolve shortcut | **Planned** | Cmd+D between adjacent clips |
| Drag transitions from library | Not planned | |
| Keyframeable visual parameters | **Done** | Transform, mask, feather, opacity, and six primary color controls use clip-local keyframes with timeline diamonds |
| Primary color correction | **Done (canonical local editor)** | Still/video per-clip Exposure, Contrast, Saturation, Temperature, Tint, and Hue; one versioned SVG graph powers preview and export |
| Copy/paste attributes | Not planned | |

## 8. Markers & Annotations

| Feature | Status | Notes |
|---|---|---|
| Beat markers (read-only) | **Done** | From storyboard; shown in ruler + as snap targets |
| Saved review-frame marks | **Done** | `Mark frame` stores numbered playhead/source anchors; individual remove and Clear marks participate in shared Undo/Redo history |
| Player point marks | **Done** | The Mark frame split control can arm `Mark point on player`; repeated composition clicks append ordered normalized X/Y points to the same numbered frame mark, draw their traced path on the active frame, and remain armed until Escape or explicit cancel |
| User-placed markers | **Planned** | M key to drop a marker at playhead |
| Marker colors / labels | **Planned** | Categorize markers |
| Navigate between markers | **Planned** | Shift+↑/↓ |
| Marker notes | Not planned | |
| Duration markers (ranges) | Not planned | |

## 9. Snapping & Alignment

| Feature | Status | Notes |
|---|---|---|
| Snap toggle | **Done** | ON/OFF button grouped with the upper timeline editing tools |
| Snap to beat markers | **Done** | Element edges snap to beat start/end |
| Snap to clip edges | **Done** | Element edges snap to other elements |
| Snap guide line | **Done** | Dashed accent line drawn at snap point during drag/resize |
| Snap to playhead | **Planned** | Clips snap to current playhead position |
| Snap to markers | **Planned** | Once user markers exist |

## 10. Undo / Redo & History

| Feature | Status | Notes |
|---|---|---|
| Undo | **Done** | Reverts UI mutations via their API operations; external safe-write entries restore the exact timeline + metadata + review-mark snapshot |
| Redo | **Done** | Re-applies UI mutations or restores the external write's complete after-snapshot |
| History stack (50 entries) | **Done** | Capped at 50, ref-backed, persisted in session storage, and incrementally merged with external snapshot entries during in-place reconciliation |
| External/agent write bridge | **Done** | Revision polling exposes the latest snapshot descriptor, imports each external safe write as one visible Undo/Redo entry, and refreshes active data without remounting the Player |
| On-disk snapshot restore | **Done** | Validated snapshot ids restore timeline, metadata, saved review marks, the auditions receipt, and any embedded layout proposals under the project lock through `POST /api/projects/[projectId]/timeline/history/restore` |
| Undo delete | **Done** | UI delete records a `delete` history entry; undo restores the soft-deleted element (`useTimelineMutations.ts`), and an external safe-write deletion is recoverable through its full snapshot entry |
| Undo mute / output format / audition / normalize | **Done (canonical local editor)** | These routes return before/after snapshot descriptors and the client records one visible `snapshot` Undo entry per mutation (normalize records a plain volume `patch`). Snapshots always embed the auditions receipt when one exists |
| Undo layout-proposal save | **Done (canonical local editor)** | `saveCoverLayoutProposal` captures before/after project snapshots with the changed proposal embedded, marks the shared revision stream, and the Layout editor records the visible Undo entry. The revision watch (`projectStateMtimeMs`) covers `analysis/auditions.json` and `preprocess/layout-proposals/*.json`, so external edits to either reconcile into the open editor |
| History panel / list | Not planned | |

## 11. Clipboard & Duplication

| Feature | Status | Notes |
|---|---|---|
| Copy | **Done** | Available from clip context menu; system keyboard shortcut still planned |
| Cut | **Done** | Available from clip context menu; system keyboard shortcut still planned |
| Paste | **Done** | Available from empty-space context menu at playhead; system keyboard shortcut still planned |
| Duplicate | **Done** | Available from clip context menu; Cmd+D / Opt+drag still planned |
| Paste attributes | Not planned | |

## 12. Context Menus (Right-click)

| Feature | Status | Notes |
|---|---|---|
| Right-click on clip | **Done** | Split, Duplicate, Copy, Cut, Lock/Unlock, Disable/Enable, Remove |
| Right-click on track header | **Done** | Solo and Mute/Unmute |
| Right-click on empty area | **Done** | Paste at playhead |

## 13. Inspector / Property Editing

| Feature | Status | Notes |
|---|---|---|
| Selected clip title in toolbar | **Done** | Shows type + beat label + duration |
| Start position (numeric) | **Done** | Inspector exposes exact seconds with one-frame ± controls; hold Option during canvas drag/resize to bypass snapping temporarily |
| Speed (scrub + step) | **Done** | ◄ 1.00x ► with drag-to-scrub (0.01 increments) |
| Duration preview while editing | **Done** | Bottom duration input drives canvas right-edge preview with snap lines and SEV hold visualization |
| Speed preview while editing | **Done** | Bottom speed scrub drives the same canvas resize preview; final speed commit may change total clip span |
| Volume and audio effects | **Done** | dB fader, 0 dB = unity (the clip as-is), range −40 dB (mute) to +12 dB, with a resulting-LUFS readout and exact numeric input. The Audio effects group leads with strength-controlled **Enhance voice** and Original/Enhanced comparison; **Normalize loudness**, classic noise reduction, and Detach/Reattach live under Advanced audio |
| Focused numeric input nudge | **Done** | Arrow Up/Down changes by one display unit; Shift+Arrow uses the field's declared fine step and does not trigger editor-level shortcuts |
| Trim in / out (numeric) | **Done** | Source media trim bounds |
| Fade in / out (numeric) | **Done** | Seconds for entry/exit transition |
| Position lock | **Done** | Checkbox to prevent drag/resize |
| Reset clip properties | **Done** | Resets trim, speed, volume, fades to defaults |
| Remove from timeline | **Done** | Soft-deletes element |
| Caption text editing | **Done** | Inline textarea in caption inspector row |
| Caption position preset | **Done** | Dropdown (bottom_center, top_center, etc.) |
| Caption animation in/out | **Done** | Dropdown presets (fade, slide, typewriter, etc.) |
| Caption font preset | **Done** | Dropdown (display_serif, sans, mono, etc.) |
| Caption offset X/Y | **Done** | Normalized screen position offsets |
| Group caption position | **Done (canonical local editor)** | Shift-select captions, then use the primary caption's X/Y controls; the selected captions move by the same delta, preserve their spacing, and commit as one undoable batch |
| Playback caption position nudge | **Done** | With an active playback caption selected, Arrow keys move it by one output-composition pixel and Shift+Arrow moves it by ten; movement previews immediately, commits through the shared caption patch path, and remains undoable |
| Caption split at playhead | **Done** | Splits caption timing + duplicates text |
| Active-word caption highlighting | **Done** | Forced-aligned cue-local word timings drive a stable full-phrase highlight in preview and export |
| Inverse Single Line captions | **Done (canonical local editor)** | `inverse` Difference-blends clean white glyphs against the composed video beneath them; `single_word` timing shows only the aligned active word and center-squeezes each handoff |
| Visual transform / mask controls | **Done (canonical local editor)** | Slider + exact values, independent per-property keyframes, explicit aggregate keyframes, and a right-aligned Reset/diamond action edge in both layouts. Normalized position offsets allow `-2…2`: `±1` moves media by half the composition and `±2` clears a full-frame element completely off canvas. |
| Visual motion presets | **Done (canonical local editor)** | Float, Bounce, and Orbit create editable, loop-closing horizontal/vertical keyframes across the selected clip. None clears only those two motion tracks, preserving scale, opacity, mask, and color animation. Manual position curves display as Custom. |
| Color correction controls | **Done (canonical local editor)** | Color section sits between Transform and Crop; every basic, advanced, curve, and LUT property uses the same slider/value plus right-aligned Reset/diamond anatomy, with color-only keyframe clearing and visible `?` help |
| Point-prompt moving foreground cutout | **Done (canonical local editor)** | Local SAM 2 tracking creates a source-mapped alpha VP9 WebM from a bounded project-video interval; shelf, Player, matte review, and export preserve alpha |

### Caption timing contract

`caption_text` defaults to phrase timing. A transcript-synced caption uses
`props.timingMode: "active_word"`, `props.wordTimings: Array<{text,start,end}>`, and
`props.activeWordColor`. Word times are cue-local seconds and use half-open intervals: a word is active
when `localTime >= start && localTime < end`; a real alignment gap highlights nothing. The complete phrase
remains mounted, so the highlight changes paint without reflowing the caption.

Generated social phrase captions default to one-to-three-word semantic fragments, with three recorded as
the row's word ceiling. The planner prefers sentence, clause, and complete phrase endings over mechanical
three-token fills, and the emitted rows use larger display type than sentence-panel captions. Dense speech
may opt into explicitly marked rapid/fast-verbatim rows because this burned-in layer reinforces audible
speech; subtitle timing mode retains the stricter duration and reading-speed behavior when text must replace
the audio. QC blocks any row that exceeds its declared word ceiling.

Agent-generated speech captions reach an existing working cut through one bounded
`replace_captions` proposal operation. The operation carries the ordered force-aligned cues, their
source-text/alignment evidence, and the shared rail style. Preview derives the whole replacement without
writing; approval soft-removes the prior active speech-caption rail and adds the complete cue set in one
history snapshot. The operation is one structural mutation because cue-by-cue approval would permit a
partial rail with missing or duplicated speech.

Agent-authored replacement captions carry a semantic `position_preset`, never raw X/Y coordinates or
offsets. The proposal schema rejects `abs_x`, `abs_y`, `absX`, `absY`, `offsetX`, and `offsetY`; preview,
approval, rendering, and spatial assessment resolve the named preset through the shared caption anchor
contract. Existing human-positioned captions may retain manual coordinates in timeline storage, but those
coordinates are UI-authored overrides and are not writable through the agent proposal surface.
Each replacement cue also carries a fail-closed source-clock binding: active speech element id, alignment
SHA-256, absolute aligned source-word start/end, and observed playback rate. Validation verifies the hash and
spoken words, requires retained word boundaries, and recomputes timeline start/duration from the speech
element's current placement, trim, and playback rate. A speed or trim change therefore makes the proposal
invalid instead of leaving apparently aligned captions on an obsolete clock.

Active timing is forced-alignment evidence, not an editable guess. Moving or extending the cue preserves
it. Truncating past the last word, resizing from the start, malformed timing writes, and mid-word splits
are rejected. Splits at aligned word boundaries divide and rebase the records. Case, terminal punctuation,
and authored line-break changes preserve timing; a lexical edit atomically returns the caption to Phrase
and clears stale records. QC and the render endpoint block invalid active timing, while `frame-state`
samples word intervals, gaps, and handoff frames.

`props.timingMode: "single_word"` reuses the same forced-alignment contract but renders only the
currently active word. Each word expands from a thin center strip, holds, and collapses into the
center over a bounded `0.12s` handoff window. Real alignment gaps render no word. A caption
element always holds exactly the words it shows, so `single_word` is stored as one caption element
per word: every timeline write and proposal preview splits each multi-word `single_word` caption it adds or changes
into one-word captions on the same lane, each with its own word timing, speech-clock window and audio
binding (`splitSingleWordCaptions` in `src/lib/timeline/caption-word-elements.ts`). The first word keeps
the caption's id; the others get ids derived from it. Pixels are unchanged by the split. Save-time
normalisation like this touches only the elements in the current write; older captions on disk change
only when something edits them or a proposal migrates them (`caption-split-on-write.test.ts`). The `inverse`
caption style uses clean white glyphs and CSS Difference compositing:
`abs(backdrop - white) = 1 - backdrop`. The blend belongs on each caption's direct compositing
wrapper, not inside the caption lane's stacking context; otherwise Chromium cannot see the
already-composed visual lanes and the glyphs incorrectly remain white. Inverse captions have no
stroke, shadow, or box and remain intentionally background-dependent—mid-gray can produce weak
separation, so rendered-frame review is required.

### 13.1 Frame-state spatial relations

`pnpm frame-state <projectId> --at <seconds>` is the read-only layout receipt for a named rendered
frame. For the selected active caption it now emits both the browser's CSS `box` and an `inkBox`
measured by rendering the frame twice and removing only that caption from the second render. The
pixel-difference bounds therefore include the exact loaded font, stroke, shadow, animation, and
antialiasing without confusing line-height leading for visible characters.

At the same time, active visual mask bounds are evaluated through the renderer's clip-local
`mask_inset` keyframe resolver. `spatialRelations` names the caption-ink-bottom to mask-top gap in
pixels and percent of frame height; positive means clearance, zero means touching, and negative
means overlap. A caller may turn that measurement into a deterministic gate with
`--expect-gap <captionId>:<visualId>:<minPx>:<maxPx>`. The JSON artifact records `pass` or `fail` and
the CLI prints the same result. This diagnostic never mutates the timeline.

### 13.2 Primary color contract (canonical local editor)

Color correction is supported only on `still` and `video_clip`. It is stored as flat visual props so the
Inspector, keyframe engine, timeline markers, renderer, and capability catalog share the same field names:
`grade_exposure_ev` (-3…3), `grade_contrast` and `grade_saturation` (0…2 internally),
`grade_temperature` and `grade_tint` (-1…1 internally), and `grade_hue_degrees` (-180…180). The Inspector
displays contrast, saturation, temperature, and tint as relative -100…100 values.

Any non-identity grade writes `color_grade_model: "linear-srgb-v1"`. Missing grade data is identity and needs
no migration; grade data without that exact model is malformed and export preflight fails closed. The shared
Remotion composition resolves grade keyframes at clip-local time and applies a single ordered SVG graph in
explicit `linearRGB`: exposure, temperature/tint, 18%-pivot contrast, saturation, then hue. Identity omits the
filter node. Reset removes only color data; Clear color animation removes only color keyframes.

### 13.3 Color continuity sampling

The editor's color-continuity review (a Checks section with per-boundary approval) was retired on
2026-10-09. `assessColorContinuityReview` still derives boundaries at the exact start/end of source-derived RGB
cutouts, at color-grade keyframes, and at adjacent same-source clips whose treatment fingerprints differ.
`pnpm verify` samples two frames before, the boundary frame, and two frames after alongside its fixed
whole-video samples, and reports them as evidence. Verification no longer waits for a per-boundary human
approval. The sampling is advisory and never changes a grade, effect, source, or timeline element.

Color-grade auditions for an existing production edit live in the working timeline’s proposal surface. Draft
options preview against the real affected clips without mutating them; every proposed basic grade value is
adjustable there with the same display conversion and bounds used by the clip Inspector. Approval writes the
selected values atomically to every targeted clip. A detached audition project is reserved for alternate media
or comparisons that need their own duration, rejection, or ripple behavior—not for a property-only grade of the
existing cut.

Layered workshop composites may use the bounded `create_visual` proposal operation for either `video_clip` or
native `still` elements. A proposed still mounts its source image directly and may carry the same Inspector-backed
opacity, transform, mask, feather, and entrance/exit animation fields as an existing visual. Proof plates,
annotations, ads, and localized blur overlays remain separate operations on explicit visual lanes; proposal
preview must not collapse them into one rendered background. Approval creates the visible editable elements,
while rejection or closing preview writes nothing. A compact still proposal may declare `duration_seconds`
directly because it has no playable source window; video clips must continue to declare complete source-in,
source-out, and source-duration handles.

The proposal validator enforces this boundary for project-authored media: a `video_clip` sourced from
`media/video-effects` is rejected unless its `effect_role` belongs to the code-reviewed allowlist of derivatives
whose saved editable graph remains authoritative. Replacing a legacy composite uses `remove_visual` and separate
`create_visual` operations in one option; removal is a reversible soft delete applied only on approval.
When authored visuals overlap in time, each compositing actor must use a separately registered `visual_N` lane;
`lane_index` is not a z-order or lane-creation surface. A proposal may atomically move elements and set
`lane_order_keys`, and its preview must show both the proposed composite and the proposed lane rows before
approval. The validator rejects new overlapping authored visuals placed on the same lane.

One proposal option represents one independently reviewable actor or adjustment. A proof image, annotation,
ad, animation, caption treatment, or grade decision is separate whenever the reviewer could accept, reject, or
tune it independently. Operations belong together
only when partial application would leave broken state—for example, soft-removing an obsolete composite and
mounting its replacement actors. Different sections, effects, or creative judgments never share an option merely
because they were requested in one conversation. Several independent cards may share an expected revision when
they opt into `rebase_policy: "independent"`. Approval advances the timeline revision, then the approval route
revalidates and rebases only pending independent siblings whose element targets do not overlap the approved option
and whose complete proposal remains valid against the new project. Conflicting siblings stay on their old revision
and therefore read as stale. The default `strict` policy preserves fail-closed behavior for proposals that must be
reconsidered after any intervening edit. Background removal is never inferred from a blue or green source plate:
proposals must preserve the raw plate unless the user explicitly chooses chroma keying.

Opening sequence edits may use the bounded `opening_sequence_edit` proposal operation when a talking-head cut
needs both a ripple removal and a source-anchored punch-in. Its preview is the connected mini-project: a derived
timeline copy that removes the proposed opening duration, shifts every later active element, replaces the caption
crossing the new boundary, and adds a silent visual-only close-up overlay at an absolute source time with adjustable
scale and X/Y position. The retained presenter clip stays intact underneath as the single continuous narration
authority; the punch-in must not mount or restart a second spoken-audio player. The real timeline is unchanged until approval.
`remove_opening_seconds`, `punch_in_source_seconds`, and the punch-in transform remain numeric proposal overrides,
so the value auditioned in the player is the value approval commits. The operation declares an affected-element
cap and fails closed when the retained source range or punch point becomes invalid.

| Artifact / field | Reads from | Level | Producer |
|---|---|---|---|
| Element treatment observations | One timeline element's persisted props and source identity | L1 | `color-continuity-review.ts` |
| Boundary kind, time, and involved element IDs | One join/effect boundary's L1 observations | L2 | deterministic boundary derivation |
| Review suggestions | L2 boundary plus the goal of consistent intentional color | L4 | advisory mapping |
| Human decision | Direct user choice, not a derived level | human review UI/API |

## 14. Canvas Rendering

| Feature | Status | Notes |
|---|---|---|
| Canvas 2D rendering | **Done** | All lanes, clips, ruler drawn on `<canvas>` |
| Image thumbnails (stills) | **Done** | Source images loaded and drawn as clip backgrounds |
| Video thumbnails | **Done** | First frame captured to offscreen canvas |
| Waveform bars (audio) | **Done** | Visible-portion-aware peak rendering |
| Clip labels (title + subtitle) | **Done** | Type badge, title, beat label on each clip |
| Duration badge | **Done** | Monospace duration in top-right of clip |
| Lock indicator | **Done** | "L" badge on locked clips |
| Play button overlay (video clips) | **Done** | Play icon on video_clip type |
| Gradient overlay | **Done** | Bottom-fade gradient for text readability |
| Ghost clip (cross-lane drag) | **Done** | Dashed border preview in target lane |
| Playhead line + triangle + timecode badge | **Done** | Accent-colored vertical line with time readout |
| Proposal preview highlight | **Done (canonical local editor)** | While a proposal option is previewed, the elements it touches are tinted (emerald fill + border) on the canvas, above clip chrome and below the playhead, so the reviewed change is legible structurally — driven by the preview API's `touched_element_ids` |
| Dark theme (CSS variable driven) | **Done** | Reads theme from container's computed styles |
| DPR-aware rendering | **Done** | Canvas scaled by `devicePixelRatio` |
| Resize-aware (ResizeObserver) | **Done** | Redraws on container resize |

## 15. Preview Player

| Feature | Status | Notes |
|---|---|---|
| Remotion Player | **Done** | Full composition preview with all elements |
| Aspect ratio toggle (9:16 / 16:9) | **Done** | Switchable preview orientation |
| Frame-synced playhead | **Done** | `frameupdate` event syncs canvas playhead |
| Fullscreen mode | **Done** | Expand timeline to full viewport |
| Landscape Library/Inspector panel | **Done (canonical local editor)** | The landscape top row is player (left) plus one tabbed Library/Inspector panel. Selecting a clip or transition opens Inspector; deselecting returns to Library. Agent edits remain a distinct `Proposals (N)` toolbar entry in the full profile. |
| Player controls | **Done** | Remotion built-in play/pause/seek/scrub |
| Mutation playback continuity | **Done** | Ordinary composition changes—including mute, unmute, gain/envelope edits, trims, and timeline moves—preserve the current frame and play/pause state. Standalone audio channels persist across those edits; only a source URL change replaces one. Embedded video audio keeps its topology identity. The play → move SFX repeatedly → seek back → replay path has its own fixture-clone regression gate. |
| External-update reconciliation | **Done (local editor)** | Revision polling requests fresh timeline data in place instead of key-remounting `TimelineStep`; the mounted Player/readiness session and playhead survive when project JSON changes on disk or an approved proposal requests a refresh. Project-static character labels load once per mounted editor rather than being refetched on every timeline-only reconciliation. |
| Stable editorial review | **Done** | `pnpm review <projectId>` fingerprints editor inputs, reuses an unchanged isolated `.next-review` build, and serves it on port 3124 without touching the development server. Review builds carry a **Stable review** badge; ordinary development mode does not spend header space on an environment label. |

## 16. Data & Persistence

### Spatial layout proposals

An animation that needs direct arrangement of many source objects may expose a
versioned spatial layout proposal instead of expanding those objects into
timeline elements. The owning timeline element declares
`props.layout_proposal_id`; selecting it opens the Layout tab in the asset
shelf. The proposal is stored at
`preprocess/layout-proposals/<layoutId>.json` and contains:

- the output-composition canvas dimensions;
- a stable, complete set of source-object IDs and asset URLs;
- the recipe-generated baseline positions;
- the currently saved positions; and
- an optimistic revision number; and
- a cumulative adjustment summary against the generated baseline: save source, based-on revision, changed item
  IDs, and per-transform-property counts.

The editor shows the full composition, expands the asset shelf into a useful
workspace, fits the canvas to the available width, and supports direct drag,
Shift multi-selection, one- or ten-pixel keyboard nudges, direct single-object
resize/rotation handles, and exact X/Y/width/height/rotation inputs. High-rate
pointer movement updates only the local draft on animation frames; one saved
proposal revision remains the persistence boundary. Saving must preserve the
complete object set, remain inside the declared canvas, write the previous
revision to `preprocess/layout-proposals/history/<layoutId>/`, and increment
the revision under the project mutation lock. Reset draft returns to the last
save; Generated layout restores the recipe baseline.

The saved `items` are current compositional authority. `generated_items` are
reset-only and cannot silently replace a human-adjusted map during a later
agent pass or animation rebuild. Every UI save declares `edit_source:
user_ui`; agent writes declare `agent`. The adjustment summary is cumulative
against the generated baseline rather than only describing the latest gesture,
so a reloaded agent can detect and preserve demonstrated geometry without
reconstructing the complete proposal-history chain.

A recipe may attach user-facing group and word labels to source objects. For
cover-built typography, the generated baseline should assign neighboring
dominant hues to complete words instead of scattering unrelated palettes
through one letterform. Those assignments are starting geometry, not locked
regions: the user can still move, resize, and rotate every source cover.

The layout workspace serves each proposal-bound source thumbnail through a
project-validated endpoint; it never assumes the standalone editor shares the
main app's static root. Readable-covers mode displays the real thumbnails at a
normalized workshop size while keeping their saved centers exact. Exact mode
shows their final render footprint. Switching preview modes is view state only
and must never dirty or rewrite the proposal.

Layout discovery is project-scoped rather than selection-scoped. The asset
Library re-queries `preprocess/layout-proposals/*.json` whenever it opens,
shows the saved-layout count, and can reopen any proposal after a reload
without first locating its timeline element. Selecting a linked timeline
element still opens its proposal directly.

The layout proposal is render input, not an alternate timeline. The animation
recipe reads the saved map by stable object ID and records the exact layout
revision in its render receipt. Timing, media ownership, and the flattened
preview/export element remain unchanged, avoiding 100 independent timeline
mutations and decoders for a 100-cover composition.

### Take auditions

Projects may define `analysis/auditions.json` as a script-section-first comparison receipt. Each section owns
an ordered set of source-bounded candidates, an optional winner, a shared preview source, and thumbnails. The
Assets panel exposes the receipt as an Audition tab with one shared decoder, section-level play-through, and
explicit winner selection. A candidate card resolves its timeline element ID, seeks the primary editor player to
that exact timeline window, starts playback, and stops at the candidate end. Play all resolves the first through
last active candidate in the section and uses the same bounded primary-player path. Selecting a winner persists to the receipt and marks the corresponding timeline
element; it does not delete alternatives, render, or create an inter-take spoken-word assembly. Candidates stay
source-mapped and independently playable until final cut boundaries satisfy the talking-head alignment gate.
When an audition candidate removes internal pauses, it remains an ordered set of visible, contiguous timeline
clips from the original source rather than a baked derivative. The primary candidate element owns the manifest
row; the other source segments are listed in `associated_element_ids`, so winner and reject actions cover the
whole alternate edit. The audition build receipt records every retained source window, every removed interval,
and the boundary words used to judge the join.
Each candidate also exposes a separate reject action. Rejecting soft-removes the candidate clip and its label,
removes the candidate from the receipt, clears it if it was the winner, and ripples later timeline content to
close the comparison gap. It never deletes the source file, and a section must retain at least one candidate.
The receipt may also list source-mapped `exclusions` for clear false starts and non-take utterances omitted during
assembly. The Audition tab surfaces their count and factual reasons; omission never removes them from the neutral
preprocessing take index.

Project alternatives may declare an explicit version family in metadata with `version_group_id`,
`version_label`, and `version_order`. The editor resolves only projects in the current family and displays them
as ordered top-level version links. Switching versions navigates to the sibling project; each project retains
its own timeline, history, media, and revision state. Projects without a group remain a one-member family and
show no version control.

| Feature | Status | Notes |
|---|---|---|
| API-backed elements (Supabase) | **Done** | Full CRUD via REST routes |
| Optimistic updates | **Done** | Patch state immediately, sync to API |
| Soft delete with reason tracking | **Done** | `removed_at` + `removed_reason` enum |
| Auto-place from storyboard | **Done** | Builds initial timeline from beats, VO, music |
| Intent tracking (autoplace) | **Done** | `props.intent_key` prevents conflicts with manual edits |
| Zod-validated patch schema | **Done** | Server-side validation of all mutations |
| Playback rate (DB-level) | **Done** | 0.25x–4x with check constraint |
| Volume gain range | **Done** | Manual fader values remain Zod-bounded by `MAX_ABS_GAIN` (=16 linear gain), while deliberate Normalize no longer stores an above-unity gain: it writes a measured, true-peak-limited derivative and returns the clip to unity. Post-render loudness QC still checks manual mixes. |
| Preprocessed waveform peaks | **Done (local editor)** | Media analysis derives and persists source-fingerprinted PCM max-amplitude peaks; missing/corrupt artifacts fall back to a non-blocking, retryable browser decoder that does not wait on autoplay permission. |
| Read-only project health | **Done (local editor)** | `pnpm project-health <projectId>` reports active versus retained timeline rows and recursive timeline/media/render/history/preprocess/instrument storage without mutating or cleaning project data. |
| Hot-timeline compaction | **Done (local editor)** | Dry-run by default. A locked apply archives soft-removed elements/transitions into a versioned gzip file, writes an exact pre-compaction snapshot and checksum receipt, then atomically rewrites only active rows into `timeline.json`. The existing restore endpoint transparently rehydrates an archived element and related transitions. Online apply uses the same project mutation lock as editing routes; offline apply refuses while the standard editor ports are listening. |

---

## Planned Features — Prioritized

### Necessary — User is stuck or severely limited without these

None currently — undo delete shipped (see §10).

### Important — User can work around it but experience suffers

| Feature | Type | Workaround |
|---|---|---|
| **Ripple delete** | Functionality | Delete + manually drag clips to close gap |
| **Snap to playhead** | Functionality | Use beat/clip snap, close enough |
| **Set In / Out points + Loop** | Functionality | Manually scrub to review sections |
| **User-placed markers** | Functionality | Use beat markers as reference |
| **Audio gain rubber band** | Functionality | Use the volume slider per-clip |

### Nice to have — Convenience and shortcuts

| Feature | Type | What it shortcuts |
|---|---|---|
| **Frame step (←/→)** | Shortcut | Click ruler to position playhead → arrows = ±1 frame |
| **JKL shuttle** | Shortcut | Play/pause button → variable-speed scrub via keyboard |
| **Go to next/prev edit point** | Shortcut | Click ruler → Up/Down arrows jump to nearest clip edge |
| **Select all (Cmd+A)** | Shortcut | Shift+click each clip → one shortcut |
| **Clipboard shortcuts (Cmd+C / Cmd+X / Cmd+V)** | Shortcut | Context menu already works; keyboard flow would be faster |
| **Split shortcut (S)** | **Done** | Splits the selected item at the playhead; ignored while typing or reviewing a proposal preview |
| **Select left/right ([ / ])** | **Done** | Selects all active timeline items wholly before or beginning at/after the playhead |
| **Toggle snapping (N)** | **Done** | Toggles the compound toolbar's Snap state without leaving the timeline |
| **Toggle Review drawer (R)** | **Done** | Slides Review in or out without changing the active proposal preview. While hidden, the existing Review control keeps its compact one-line label and active styling, and the timeline remains read-only; reopen Review and use Back to live to exit. Hiding the drawer never approves or applies the proposal. |
| **Duplicate shortcut (Cmd+D / Opt+drag)** | Shortcut | Context menu duplicate already works; direct manipulation would be faster |
| **Select all on track** | Shortcut | Shift+click clips on a track → right-click shortcut |
| **Default cross-dissolve** | Functionality | Hard cuts work fine for short-form video. Cmd+D would add dissolves. |
| **Marker colors / labels** | Functionality | Markers work without colors. Colors add organization. |
| **Navigate between markers** | Shortcut | Click markers in ruler → keyboard shortcut is faster |
| **Snap to markers** | Functionality | Already snap to beats and clips. Extends to user markers. |
