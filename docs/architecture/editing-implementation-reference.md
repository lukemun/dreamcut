# Editing implementation reference

Task-loaded reference extracted from AGENTS.md on 2026-09-29. Read the relevant
section when implementing or using these operations. The [operating guide](../../AGENTS.md)
owns authorization; these details never grant an agent permission to bypass proposals.
Paths in code spans are repository-relative. For runtime architecture, use
[playback and rendering](playback-rendering.md).

## Proposal operation contracts

- A proposal carries **options** (schema 2): `options[{ id, label, recommended, summary, operations[] }]`, exactly one recommended. The server counts each option's changed fields (`requested_mutations`) and fills `caps`; an agent that states either must match the server's value (decided 2026-10-10: derivable bookkeeping is not the model's job). Caps are **per option** — only one is ever applied, so alternatives do not consume each other's budget. A schema-1 proposal (flat `operations[]`) is still accepted and normalized to a single recommended option.
- A proposal may add a native boundary transition through `operations[].create_transition`. Use a unique operation `element_id` for its transition ID; specify adjacent touching source/destination clip IDs, type, duration, and optional direction/blur parameters. Preview and approval derive the same transition; no direct transition API is needed.
- A proposal may add playable audio through `operations[].create_audio`. It names the full source duration plus absolute source-in/source-out seconds; preview and approval derive clip duration and tail trim from that window. This is the proposal-safe creation path for audition selections—never repurpose an existing clip or encode a source slip as a trim.
- Motion-graphic proposals are primitive-first: reuse one source per independently meaningful icon, person, logo, card, or prop and create separate timeline instances for repeated copies. Do not bake adjustable repetitions into a joined still; only intentionally inseparable artwork may remain composite.
- Prepared stabilization uses `operations[].use_video_stabilization`: preprocessing finishes first, then the proposal binds the original and processed picture authorities, preview proxy, hashes, mode, strength, and recipe to an existing video clip. It may be paired with a volume patch and a `create_audio` row carrying a bounded `voice_enhancement` receipt, so stabilized picture plus detached cleaned speech remains previewable without changing the working timeline.
- `operations[].use_recast` replaces the people in a placed video clip with a kept, prepared recast (Generate recast models). It names the recast, the Generate request and `source_window_start`, the start of the window sent to the model on the original footage clock. The clip keeps its timeline start, duration and look; its in-point moves onto the recast clock and the original source is recorded in `props.recast`. A window that does not contain the clip is refused. Undo restores the original picture.
- `operations[].use_voice_enhancement` binds the processed render authority and a separate timing-identical `processed_preview_audio_source_url`. The preview clock must be the lightweight audio-only asset, never the full muxed processed video. Retained sections of one source or members of one compound share the same treatment recipe, strength, processed authority, and preview clock; compare/original and restore move the group together.
- A proposal that mutes embedded video audio must silence and preserve both scalar gain and `props.volume_envelope`; one without the other creates two audible authorities when a detached lane is added. `operations[].reattach_original_audio` restores that embedded gain/envelope and soft-removes the aligned detached voice element as one reviewable reset.
- A complete generated speech-caption rail uses one `operations[].replace_captions` structural edit. It replaces the active caption rail atomically and carries ordered force-aligned cues plus shared style; never propose cues independently, because partial approval can leave missing or duplicated speech. Every cue is source-bound: it records the active speech element, alignment hash, absolute aligned source-word bounds, and observed playback rate. Validation recomputes timeline timing from that mapping and fails closed when the clip clock, trim, alignment, or spoken words differ.
- A talking-head cutout derived from spoken footage uses `operations[].sync_speech_visual`. It binds the derivative receipt and absolute source window to the active speech element, then derives placement, trim, duration, and playback rate atomically. Once bound, generic patches cannot retime it. A proposal that changes the master speech clock must follow that source edit with a `sync_speech_visual` operation for every linked picture. Source-bound captions follow automatically in the shared preview/approval derivation; a replacement rail is needed only when intentionally regenerating captions.
- **Generate captions** creates each cue already linked to the selected speech clip, with `caption_follow_audio: true` and an immutable source-word binding. The Timing inspector offers **Unlink from audio**, reversible with Undo; there is no enable toggle. Legacy provenance alone never establishes a link. Moves, rate changes, source trims, splits, deletion, and restoration reproject linked captions and word highlights together. Cuts through words fail closed. Generation is available on selected speech clips and in Assets → Captions: local transcription, human transcript review, then MFA alignment and one atomic Undo entry. It replaces only that source's linked captions and preserves independent text.
- `GET /proposals` lists them; `GET /proposals/<id>` returns the proposal plus derived review rows. Every row's verb, target, and before→after is **computed from the patch**; the only field the agent authors is `operations[].rationale`. A proposal cannot describe itself as doing something other than what approval writes.
- Pending proposals whose `expected_revision` no longer matches the working timeline remain in the audit trail but are not actionable: the editor excludes them from the review drawer and its “awaiting review” count. Read them through the all-proposals API when provenance is needed.
- A revised or consolidated proposal may name `supersedes_proposal_ids`. Creation never resolves those drafts. If the human approves the successor, the same approval marks only those explicitly named pending records as superseded; rejecting the successor rejects its entire explicitly linked chain of pending previous drafts. Use this for replaced versions, never for independent work the user may still want.
  The pending review inbox folds earlier versions beneath a fresh pending successor instead of displaying duplicate cards or counting them twice. The successor is the only visible card; previous drafts and their summaries remain internal, with no revision disclosure. This is computed presentation, not rejection or deletion: rejecting the successor dismisses its linked pending previous drafts as well, preserving all records in history. A successor becoming stale can still restore a valid predecessor to the inbox. Unfiltered proposal reads retain all records and the replacement relationship. Preserve revision history rather than overwriting the prior proposal in place.
- Multi-beat editorial work is reviewed as separate proposal cards by default: one independently reviewable beat per proposal. Disjoint sibling beats use `rebase_policy: "independent"`, allowing approval to revalidate and rebase the remaining cards. Never mark overlapping or dependent edits independent; combine them atomically or create the dependent proposal only after its prerequisite resolves. Combine distinct beats only when the user explicitly requests an integrated review or separation would make a preview misleading or technically invalid.
- `GET /proposals/<id>/preview?option=<optionId>` returns the timeline **as it would be** if that option were approved, in the same shape as `GET /timeline`. Nothing is written; preview and approval share one derivation (`deriveProposalTimeline`), so the draft cannot drift from the commit.
- `POST /proposals/<id>/approve` `{option_id}` applies one option atomically, bracketed by explicit before/after `history/` snapshots, and returns their descriptors so the editor records the whole approval (timeline plus any metadata writes) as ONE visible Undo entry. `DELETE /proposals/<id>` rejects it and never touches the timeline.
- Approval snapshots also carry every proposal record whose review state the approval changes: the approved card, explicitly superseded drafts, and independently rebased siblings. Undo must restore those records with the pre-approval timeline (reopening the cards and their original expected revisions); Redo must restore the resolved/rebased records with the applied timeline. The Review surface refreshes immediately after either restore. Timeline-only Undo is a contract violation because it leaves the visible review state lying about what is applied.
- Approval re-checks `expected_revision` (a sha256 of `timeline.json`) under the project lock and **409s** if the timeline moved after the proposal was made — a hand-edit is never clobbered. Staleness is computed on read, never stored. Re-approving an already-resolved proposal also 409s.

Records live in `projects/<projectId>/proposals/<proposalId>.json` and are an audit trail, not editor state.

## MCP tool surface

The typed way for a coding agent to drive the editor is the MCP server at `mcp/server.mjs`
(registered in the repo root `.mcp.json` as `timeline-editor`; requires the dev server on
`localhost:3123`, override with `TIMELINE_EDITOR_BASE_URL`). It wraps the HTTP API, managed media
ingestion, the proposal surface, bounded assembly/audition creation, and safe read instruments. Always
available: `assembly_create`, `assembly_get`, `timeline_get`, `media_import`, `proposal_create`, `proposal_list`, `proposal_get`,
`proposal_preview`, `audition_create`, and `run_instrument`. `assembly_create` is the generic first-build route: it refuses overwrite, records the script/source/direction brief, and creates a fresh `agent_workspace` for autonomous direct assembly until the first layout handoff or human timeline edit. `media_import` may create an empty
project and register source assets but never places them on a timeline. `audition_create` is the
bounded net-new-media assembly path: it creates a dedicated audition project and refuses overwrite.

The 16 element/transition/lane/output mutation tools are **project-scoped, not open**
*(assembly grant, 2026-08-13)*. They write a timeline directly, so they are allowed only inside an
**`agent_workspace`** project — one an agent assembly/audition flow created (`createProject`'s
`agentWorkspace` option; `assembly_create` and `audition_create` set it) and only until the first layout handoff or human edit. That grant
is a one-way latch: any mutation the safe-write layer cannot attribute to the agent clears
`agent_workspace` for good, and there is no re-grant path — from then on the project is an ordinary
working timeline and the same calls fail closed with the proposal-gate message. Applying an approved
proposal does not revoke, because the editorial work there is the agent's. Attribution is a short-lived
lease the MCP writes beside the project around each granted call (`mcp/proposal-gate.mjs`
`withAgentWriteLease`), since the UI and the MCP otherwise arrive as the same HTTP route on the same
process. `proposal_approve`, `proposal_reject`, and `history_restore` are refused in **every** project,
workspace or not: the grant never opens self-approval or history rewriting. The catalog cannot see a
project id, so it publishes the mutation tools with that rule in their descriptions and the gate
enforces it per call. Human approval in the editor applies through the shared safe-write layer,
snapshots `history/`, and reconciles into the open editor as one visible Undo entry.
Render/verify/export are deliberately not exposed — rendering is delivery and needs an
explicit human request. `node mcp/server.mjs --catalog` prints the machine-readable
agent catalog without serving.

Playable media creation and source-boundary edits use semantic MCP tools:
`element_create_from_source_window` accepts absolute source in/out plus the full source
duration and derives `duration`, `trim_start`, and tail `trim_end`;
`element_trim` moves a real head or tail edge while preserving the opposite source
boundary. The generic `element_create` refuses playable media, and raw MCP batch/proposal
operations reject partial trim patches. This keeps unsupported slip edits out of the
agent surface and makes every removed source handle explicit and reversible.

The historical one-offs (363 files) were removed from the tree on 2026-07-22; they remain fully recoverable from git history (`git log --diff-filter=D -- scripts/` to find them, `git show <sha>^:<path>` to read one). What each did is also carried by the affected project's `history/` snapshots and `renders/AUDIT.md`. Scripts dated 2026-07-22 were kept in case a same-day session still needed its build/apply pair — sweep them the same way once stale.

## Timeline implementation and recovery

**1. The HTTP API.** These are implementation routes used by the editor UI and approved-proposal application, under `/api/projects/<projectId>/timeline`: `GET` (state), `POST /elements`, `PATCH|DELETE /elements/<id>`, `PATCH /elements/<id>/props` (safe partial-props merge), `POST /elements/batch` (atomic multi-element mutation), `POST /elements/<id>/{split,restore,duplicate}`, `POST /transitions`, `PATCH|DELETE /transitions/<id>`, `PATCH /{lane-order,muted-lanes,lane-defaults,output-format}`. `PATCH /output-format` accepts `aspect_ratio` and/or `delivery_target`. Coding agents must not call these mutation routes as an alternative to `proposal_create`. Mutation routes accept an optional `expected_revision` and enforce frame quantization, lock rules, and transition re-validation; approved writes reconcile into the mounted UI without remounting the Player.

**2. Direct file edits.** This remains a recovery/debugging mechanism for a human maintainer, not an agent edit path. The open editor polls every 2s and reconciles the fresh active payload in place when the file changes outside the server. The Player session and playhead remain mounted. Rules to keep the file valid:

- The file carries a top-level `schema_version` (see `src/lib/local-store/timeline-migrations.ts`). A file without one is treated as version 0 and migrated ON READ — pure, never written back; the next real write stamps the current version. A file from a NEWER schema than the running editor fails closed instead of being reinterpreted. When you change the on-disk format, add a migration to the chain plus a fixture test — never reinterpret old files in place.

- Rows are snake_case, exactly like the app's `timeline_elements` / `timeline_transitions` tables. Give new rows a UUID `id`, `project_id` = the project id, and ISO `created_at`/`updated_at`.
- **Write the FULL field set, not just the fields you care about.** A new row needs `playback_rate`, `fade_in`, `fade_out`, and `position_locked` alongside the obvious ones — the canvas reads them even when the renderer doesn't. Copy the key list off an existing element of the same `type`. *(Earned 2026-07-21: omitting `playback_rate` threw from `buildVideoPreviewFrameCacheKey` and looked like an editor bug. The v0→v1 migration now backfills missing numerics/flags on read, so this is a safety net rather than a crash — but a backfilled default may not be the value you meant, so still write full rows.)*
- Element `type` ∈ `still | video_clip | vo_segment | vo_full | music | sound_effect | caption_text`.
- **`trim_end` is a TAIL TRIM, not an absolute source timestamp.** It is seconds cut off the END of the source: a 30s file windowed to 8.7s–29.0s takes `trim_start: 8.7, trim_end: 0.93`. `resolveMediaTiming` computes the playable window as `source_duration_seconds - trim_start - trim_end`, so an absolute end time makes that negative, clamps it to zero, and mounts the clip as a 1-frame `#t=8.73,8.77` window — a frozen frame that never plays and has no audio. The clip's own `duration` can mask this on short windows, so it may look fine in one section and dead in another. *(Earned 2026-07-21.)*
- **`props.source_duration_seconds` is the FULL source file duration**, never a section end. The preview player derives its media fragment from it, with the same frozen-frame symptom when it is wrong.
- **For generated audio, duration authority is `ffprobe`, never the provider's alignment.** A TTS response's word/character alignment ends at the last word's nucleus; the consonant release, the breath tail, and the codec's decode padding all live past it. Mounting a clip at the alignment end clips every line — 0.13–0.33s each across ten ElevenLabs lines, heard as the last word being bitten off. The alignment times the CAPTION CUES; it never bounds the clip. *(Earned 2026-07-22.)*
- **Audio gain has one effective authority.** When `props.volume_envelope` is valid, the renderer reads its
  absolute gain and scalar `volume` is only the fallback. Use `writeVolumeEnvelopePatch` for envelope changes;
  it preserves unrelated props and synchronizes scalar `volume` to the opening envelope point. Do not hand-edit
  only `volume` or only the envelope and leave the fader, topology resolver, and renderer disagreeing.
- **Do not use gain as an audio-node key.** The node key includes source-time identity and native/Web Audio
  topology. Same-topology gain, fade, and envelope edits update the mounted clock in place. Source-time or
  topology changes replace only that node. After changing audio controls, revision reconciliation, media
  identity, or Web Audio selection, run `pnpm verify:audio-volume-replay --project <id> --element <audio-id>
  --volume <test-gain> --port 3124`; use a same-topology gain for every change and a boundary-crossing gain when
  topology selection changed. A fresh-load or continuous-boundary pass alone does not test replay after an
  interactive gain edit.
- **Live fader movement is not a timeline mutation loop.** Pointer-move gain belongs in the element-keyed
  preview-audio store so only the selected audio track rerenders. Release creates one history/persistence entry,
  and the preview override stays until that write resolves. Keep the persisted native/Web Audio topology fixed
  during the gesture; a native track caps at unity while dragging and may switch topology once on commit. Any
  change to this path must pass `verify:audio-live-gain` for both a native and Web Audio element. The override
  is a lease, not durable gain: clear it on pointer cancellation, selection change, Inspector unmount, window
  blur, and page hiding so a stranded zero cannot silently override the correct saved dB value until reload.
- **`playback_rate` on a `video_clip` is a real speed ramp** and is honoured by both the Player and the render. Resolve source windows and rate through the shared timing helpers and owned frame runtime. Verify speed changes with an encoded renderer fixture that crosses the changed interval; a Player smoke test alone does not prove export timing.
- **Visual clips (`still`, `video_clip`) must stay frame-aligned at 30fps** — `timeline_start`, `duration`, and video trims are multiples of 1/30 (0.0333…). Min duration = 3 frames (0.1s).
- Lane keys: `visual_0`, `visual_1`, … · `audio_narrator` · `music_0` · `sound_effect_0` · `captions_0`. Set `lane_index` to the lane key's numeric suffix.
- `source_url` is `/api/projects/<projectId>/media/<relative-path>` for local files (or any absolute URL).
- **Soft-delete through normal edits**: set `removed_at` (ISO timestamp) + `removed_reason: "user"`. Restore by nulling both. Mature projects may later run the canonical compactor, which moves tombstones out of the hot timeline into `archive/timeline-tombstones.v1.json.gz`; never hand-delete rows as a substitute. The restore API transparently rehydrates archived rows and related transitions.
- Transitions (supported types and limits in `src/lib/timeline/contracts.ts`) are only valid between flush-adjacent visual clips in the same lane. If you hand-move clips so a transition no longer touches, the UI silently ignores it — either delete the transition or make any API element PATCH afterwards (that triggers re-validation and marks it `invalidated`).
- Caption text lives in `props.text`; styling props are composed by the API (`composeCaptionProps`). Active-word captions additionally store `props.timingMode: "active_word"` and cue-local `props.wordTimings`. Do not lexically edit `props.text` while retaining those timings: use the safe props API, or atomically switch to `timingMode: "phrase"` and clear `wordTimings`.
- Generate transcript-synced highlighting with `pnpm captions-from-alignment <projectId> alignment.json --mode active-word`. The phrase stays mounted while the aligned word interval `[start,end)` receives `activeWordColor`; real gaps highlight nothing.
- Primary color correction for visual clips uses flat props `grade_exposure_ev`, `grade_contrast`, `grade_saturation`, `grade_temperature`, `grade_tint`, and `grade_hue_degrees`, plus `color_grade_model: "linear-srgb-v1"`. Keyframes use those same names in `props.keyframes` at clip-local seconds. Prefer the Inspector or canonical helpers in `src/lib/timeline/color-grade.ts`; malformed or unknown models block export.
- **Chroma key** on a `video_clip` uses `chroma_key_color` (`#rrggbb`), `chroma_key_tolerance`, `chroma_key_softness`, and `chroma_key_spill` (all 0–1), plus `chroma_key_model: "color-key-v1"`. **The colour is the enable switch** — the three amounts do nothing without it, and clearing it turns the key off; amounts written alone are reported as an error rather than silently ignored. The amounts keyframe; the colour deliberately does not (it describes how the clip was shot). Canonical helpers are in `src/lib/timeline/chroma-key.ts`; malformed or unknown models block export. The Inspector's **Review view** (Composite / Source / Key only / Alpha matte, in `chroma-key-review.ts`) is a preview-only projection over the elements handed to the Player — it mirrors the cutout review modes and must never reach `timeline.json` or the export. Tune against Alpha matte: the background should go solid black without eating into the white subject. Put the keyed clip on a lane ABOVE what should show through — remember `lane_order_keys` is **top-first**, so index 0 composites in front. Prove a key with `pnpm verify:chroma-key` (renders through the production composition and fails if the lower lane is not revealed or the subject is eaten).

**Recovery:** agents do not restore history or overwrite timeline files. Human recovery must restore the associated review state as well as timeline/metadata; use the supported Undo/history path. A timeline-only file copy is not a complete proposal rollback.

## Media preparation details

Drop files into `media/` (nested folders fine; `media/sfx/` classifies audio as sound effects). Durations/dimensions are probed with `ffprobe` (cached in `media-index.json`); without ffprobe the shelf shows unknown durations and the UI discovers video durations on placement. Supported: png/jpg/webp/gif/avif, mp4/mov/webm/m4v, mp3/wav/m4a/aac/ogg/flac.

### Custom moving cutouts

Agent preparation uses the [cached cutout tools](cutout-preparation.md), with durable jobs,
source-image evidence and immutable bounded corrections.

Opaque project videos expose **Assets → Videos → Cut out**. The dialog selects a bounded source interval,
a prompt frame, positive object points, and optional Shift-clicked background exclusions. The local SAM 2
environment under `.matting/` propagates the prompt through the interval and emits an audio-free VP9 WebM
with alpha under `media/cutouts/`. Source fingerprints, interval/frame cadence, prompt geometry, output path,
and evidence directory are recorded in `instruments/media-index/custom-cutouts.json`; generated assets carry
their exact receipt duration and appear as **Cutout** in the shelf. The original remains unchanged.

Use the cutout as a synchronized higher visual lane above UI/frame plates. Review its full interval with the
Inspector's Base, Matte, Cutout, and Composite views before delivery. This is local source preprocessing, not
an online generation service.

**Cutout vs chroma key.** A key removes pixels by colour distance, so it needs a backdrop whose colour appears
nowhere in the subject AND is evenly lit. A plain white or brown wall fails both — it overlaps skin, hair, and
clothing, and it carries a lighting gradient plus the subject's own shadow — so real-room talking-head footage
belongs to the SAM 2 cutout, not `chroma_key_*`. Reach for the key only on genuinely uniform sources: stock
green-screen elements, AI clips prompted onto a flat backdrop, or graphics rendered on a solid plate.

### Preview proxy preprocessing contract

Every video gets a preview proxy during source preprocessing, before timeline assembly. The
[mandatory proxy contract](../standards/preview-proxy-contract.md) prohibits original-source fallback
and blocks missing, unverified, or oversized preview videos in both workspace layouts. Preserve the
camera original beside it as archival authority; the proxy is disposable editor infrastructure, not a new
master. For HDR/HLG/PQ footage, first create one full-resolution SDR BT.709 render authority through the
approved color-management path, then derive the preview proxy from that authority. This paired SDR baseline
is mandatory before grading because editor and renderer cannot apply different HDR display transforms.

- Fit video within 1280×720 landscape or 720×1280 portrait, preserve aspect/orientation, and use CFR at
  the composition frame rate, H.264, `yuv420p`, fast start, and AAC audio.
- Downscale with a low-pass/area filter. Do not sharpen preview proxies: the browser scales the proxy a
  second time and repeating fabric, screens, or fine lines can become preview-only moiré.
- Record archival source, render authority, proxy path, fingerprints, recipe version, dimensions, color tags,
  duration/frame count, and distributed parity samples in the source map. Require duration/frame-count parity
  and the recipe's minimum sampled SSIM before placement.
- Version the proxy URL when the recipe changes instead of overwriting a browser-cached URL in place.
- Workshop playback uses `props.preview_source_url`; production rendering uses the paired SDR authority in
  `source_url`. The untouched HDR original remains recoverable archival provenance.
- Managed imports and browser uploads enqueue preparation immediately. Existing timeline loads repair missing
  local proxy caches through transient `runtime_preview_*` bindings that are stripped before persistence; this
  cache repair is not a timeline edit. New video placement remains blocked until its package is ready.
- Play, seek, and remount starts are gated on the real mounted media holding future data for a one-second stable
  window. Do not require browsers to report `HAVE_ENOUGH_DATA` while paused. Upcoming video cuts reserve a
  proxy-only warmup runway eight seconds ahead; warmers seek the incoming source window and the actual Player
  video premounts five seconds early. Keep this decoder cache bounded. With detached speech, audio is the sole
  preview clock and synchronized picture/cutout layers are tightly corrected followers: follower video must not
  use `pauseWhenBuffering`, because a picture buffering gate can stall while independent audio keeps advancing.
  Only audible muxed video owns a video buffering pause. Verify representative cuts with the continuous
  freeze-classification probe; cache completion alone is not playback proof.
- Continuous alpha presenter compounds use a stricter interactive profile: preserve aspect ratio, cap the
  longest edge at 640 px (360×640 for 9:16), keep CFR at 30 fps, and encode VP9 `yuva420p` with alpha. The
  source sections remain export authority. Verify exact frame count, alpha metadata, full-stream decode, and
  absence of empty alpha frames before offering the proposal. Do not reuse the older 720×1280 compound proxy
  profile; VP9-alpha software decode at that size caused avoidable buffering in the editor.

Preparation is independent of optional media analysis. Its durable per-source receipts live under
`preprocess/media-preparation/`; the Assets shelf reports `imported`, `preparing`, `ready`, or `failed` and
offers retry. Apple HDR sources automatically use the approved full-resolution SDR authority pair before the
browser proxy. Existing timeline source changes remain proposal-gated even though disposable proxy repair is
automatic.

Media analysis does derive `waveform_peaks` from its mono PCM audio branch and publish the versioned
`2,000`-sample artifact into `peaks.json`. Do not add a second interactive waveform pipeline. The browser
decoder is the required fallback for unprocessed, missing, or corrupt peaks and must stay non-blocking.

## Talking-head take-selection gate

Inter-take spoken-word cuts require word-level MFA forced alignment against the reviewed transcript before
timeline mutation. Whisper or WhisperX locates candidate passages; its segment or word timestamps do not
authorize an applied boundary. If MFA or its acoustic/dictionary environment cannot run, stop before making a
hybrid cut: create an audition project with the uncut takes on separate visual lanes, record the alignment
blocker, and leave selection provisional. Never silently downgrade to Whisper timing.

During the workshop, put every retained candidate clip on its own visual lane and preserve source handles.
Do not flatten the assembly until the human approves the spoken boundaries. The cut map must record, for each
inter-take edit, the source take, MFA word before/after, aligned source bounds, and resulting timeline bounds.
It must also name the owner of every boundary phrase. Accept a join only after two independent checks: word
integrity (no duplicated, omitted, or clipped speech) and cadence (a performance-appropriate amount of real
source breath or room tone, neither a collision cut nor surplus dead air). Do not create cadence by extending
the outgoing clip's last frame. If one join fails or changes, apply both checks to every join in the assembly
before reporting the cut clean.

Audition projects can additionally store `analysis/auditions.json`. This groups source-bounded candidates by
script section rather than source chronology. Assets → Audition uses one preview decoder, plays a section's
candidates through the editor's primary player, and persists the chosen winner to both the receipt and its timeline clip.
Clicking a take seeks the primary player to that candidate's timeline window, starts playback, and stops at the
candidate end; Play all spans the active section's first through last candidate. Winner selection
does not authorize deleting alternatives or manufacturing an inter-take spoken-word cut. The explicit reject
action is separate: it soft-removes that candidate and its editorial label, removes the candidate from the
receipt, and ripples the comparison timeline closed while preserving the source file and timeline history.
For parameter auditions such as voice casting, the persisted winner is the handoff to later generation UI.
The standalone distribution preserves the immutable choice snapshot for later manual or agent-assisted assembly,
but does not ship the private workflow harness that previously powered an **Assemble with agent** action. The
compile endpoint therefore reports that capability as unavailable instead of presenting a button that cannot run.
Generation and rendering remain separate, explicitly authorized steps.
