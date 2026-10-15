# Editor UI architecture

[Architecture overview](README.md) · Status: current workspace structure and intended interaction boundaries, reviewed 2026-09-28.

## Responsibility and design decision

The UI translates project state, selection, and candidate edits into a consistent editing workspace. Its organizing unit is the creator's task: seeing the composition, choosing media, changing a selected item, or reviewing a proposal. Internal effects, services, and data stores do not each become a permanent tab.

This separation lets new capabilities enter an existing domain without reorganizing the whole application. It also means a capability is incomplete if its implementation exists but users cannot discover, preview, adjust, reset, or recover it through the normal workflow.

## Surfaces and state boundaries

| Surface | Responsibility |
| --- | --- |
| Project navigation | Move among stable project-level activities |
| Preview and transport | Show the current composition and own playback interaction |
| Timeline | Expose time, layers, selection, source handles, and edit structure |
| Properties | Edit the selected item's supported task domains |
| Library / Properties tool area | Browse assets or edit the selected item above the timeline, without resizing the timeline when switching tools |
| Fixed Chat / Proposals dock | Keep conversation mounted while reviewing and tuning proposed changes |
| Guide and user pages | Discover reusable capabilities and manage personal context |

The delivery canvas is project state; tall/wide workspace layout is a user viewing choice. The video shape (output aspect ratio) is visible as **Shape** (9:16 · 4:5 · 1:1 · 16:9) at the top of the viewer's Preview settings; it writes the same value as Export's aspect ratio, as one Undo step. The layout follows the shape one way: opening a project or changing its shape (by Shape, Export, Undo/Redo or an agent) selects Tall for 9:16, 4:5 and 1:1 and Wide for 16:9 (a square frame gets the full viewer height beside the editing column). A manual Tall/Wide flip is remembered locally per project until the shape changes again; it is never stored in the timeline and never changes the output. Selection and open drawers do not change the rendered output. A temporary proposal preview selects a candidate composition without replacing the working timeline. The [project model](project-model.md) and [proposal system](proposals.md) own those distinctions.

The [Properties and recipes boundary](properties-and-recipes.md) specifies the target separation between fundamental controls, keyframes and Library workflows. It records the inspector migration without claiming the current production tabs already implement it.

## Workspace arrangement

The single workspace header contains the DreamCut logo and name (linking to the dashboard), Dashboard and open project tabs, the editable active project title, Editor / Generate / Storyboard, and Export. The workspace layout switch stays in the timeline toolbar;
it does not change the output format. Guide and User live in the projects dashboard.

Horizontal layout places tools beside the viewer above a full-width timeline.
Vertical layout places tools above the timeline on the left, the viewer in the
middle, and Chat / Proposals on the right. Both use one mounted player and the same Properties body. The shared media selector includes Library, Captions, Recipes and Properties in
a compact icon rail beside the tool content; the inspector adds only selection-specific controls below it. Switching
tools or Chat / Proposals preserves the reserved regions, so the
timeline does not jump. One toolbar above the tracks contains history, editing and view controls at a consistent 32-pixel height. Fullscreen sits beside the settings gear in the project header; expanded playback retains its exit button. The editor player has a floating quick mute button beside playback, separated by a divider and without an expanding volume slider. Import lives beside the Library search field, not in the compact tool rail. Image cards have a compact Add to timeline action; generation references are chosen from Generate.
Previous/next edit points sit beside Play; review marks live inside the top of the chat composer. The timeline toolbar stays on one row. Shift+Z restores the full time range without a toolbar button; lane height
remains in its existing control, ranging down to 40% with a 32-pixel lane minimum. Safe zones live inside player settings as an Off / Reels / TikTok select. The compact chat
composer contains a compact, bordered marks group above its text input. Marks opens a list above the composer, constrained to the chat dock width. Clear all marks sits beside Marks; each list item retains its own delete button. Existing notes remain visible, without an empty note-entry field or duplicate footer action.

The project shell owns the fixed right dock and persistent DesktopChat (desktop app only). Proposal
review is portaled into its Proposals tab. Without the dock (the browser, often half a screen beside
a coding agent that is itself the chat), Proposals stays in the header and its drawer slides out on the
side away from the preview: from the right over Tall's side column, from the left over Wide's tool
column and the timeline beneath it. Its default width runs exactly to the edge of the video frame
(`[data-composition-master-frame]`), so it covers every control beside the preview and none of the picture. Clicking
the open tool-rail item again folds the tool panel to the rail and gives the viewer the width. Below a
1100px window the workspace uses Wide whatever the shape and hides the Tall/Wide switch, restoring the
creator's choice when there is room. Compact property rows wrap their controls below the label rather
than clip in a narrow panel. Pending review appears as a colored count badge on Proposals, without a separate notice row. The selected dock tab fills its half of the rounded container without an inset, using a contrasting surface without a bottom highlight. Editor quality checks (color-continuity review) were retired on 2026-10-09; `pnpm verify` still samples those boundary frames as evidence. Proposal lists refresh automatically; loading errors retain a contextual Retry action. Respond in Chat stages a proposal ID
and summary alongside the creator's message; it neither sends nor approves an
edit. Sending remains explicit. Browser-only sessions show a desktop-chat notice.
Generate has its own project route and reuses AssetShelf’s generation form and reference picker.
Selecting is how the creator points the agent at things: clicking a clip, Library item, caption look,
text preset, sound, track or layout adds it to one project-wide selection (outlined where it was
chosen). Without the chat dock it is listed in Selected beside Marks, where each item can be removed;
it is saved with the project for `editor_context_get` and `timeline_get`. Catalog tiles keep a
labelled Add on the preview's corner for using an item directly. Music and Sounds filter by quiet
Mood/Energy and Type/Shape chips whose menus list every choice. Layouts (after Templates in the rail)
offers 15 split-screen, grid and picture-in-picture arrangements; selecting one points the agent at
it, and Add fills its slots with the selected timeline clips (front-most lane first) by writing each
clip's crop, size and position as one Undo step.
The settings gear is portaled into the project header immediately before Export. Its popover stays within the available viewport, with scrolling for content that exceeds the available height. Shared PreviewControls float in a centered pill over the bottom of the actual composition in both editor layouts, without reserving a separate row. Controls remain visible and keyboard accessible. Expanded and standalone viewers retain their existing in-viewer controls and local gear; embedded editors without a header use a local gear fallback. The editing transport omits its duplicate seek slider;
the timeline owns seeking, while expanded and standalone viewers retain a scrubber. This changes their placement, not playback authority.

The dark appearance uses muted blue-gray surfaces with neutral borders. Workspace
boundaries use the shared `WorkspaceResizeHandle`: drag the chat edge, tools/viewer
boundary, or timeline top edge. Bounds preserve usable neighboring regions. Sizes
persist locally (tools and timeline separately for tall/wide layouts). Arrow keys
adjust by 16px, Shift by 4px, Home/End reach bounds, Escape cancels an active drag,
and double-click resets that divider. These preferences do not enter edit history.
The 12px current/total time readout sits in the top-right of the compact 44px Lanes header and uses playback duration, not padded scroll extent. Quick mute is portaled into the timeline toolbar beside layout controls. Settings stays with playback beneath the tall viewer; its compact menu contains Capture frame and Safe zones, with renderer, preparation and preview quality behind the shared Playback & quality disclosure. Expanded playback keeps all controls inside the viewer. New timeline viewports start at 50% lane height; existing saved heights
remain unchanged.

## Interaction flow

```text
selection + supported capabilities → appropriate Properties domains
user gesture → responsive temporary values → commit one edit on completion
             → cancellation discards the unfinished gesture
persisted edit → history entry → reconcile into the mounted workspace
```

Controls have defined values, units, ranges, and reset semantics. Reset, disable, remove, and regenerate are different operations. Domain organization and shared rows make these differences legible across effects. Human precise-value controls remain useful even when an agent authored the initial layout semantically.

Transient UI changes should not destroy playback state. The player, its source clocks, and decoders have a lifetime distinct from an inspector or drawer. Expanding the preview should enlarge the preview surface without turning the entire application into a playback view or remounting the session. [Playback architecture](playback-rendering.md) owns the underlying runtime.

## Implementation map

- [TimelineStep.tsx](../../src/components/studio/TimelineStep.tsx): workspace integration and editor orchestration.
- [TimelinePlaybackShell.tsx](../../src/components/studio/timeline/TimelinePlaybackShell.tsx): tall/wide composition of preview and workspace regions.
- [TimelineToolbar.tsx](../../src/components/studio/timeline/TimelineToolbar.tsx): editing, panel, view, and transport affordances.
- [TimelineInspectorPanel.tsx](../../src/components/studio/timeline/TimelineInspectorPanel.tsx), [useTimelineInspector.ts](../../src/components/studio/timeline/useTimelineInspector.ts): selected-item Properties integration.
- [AssetShelf.tsx](../../src/components/studio/timeline/AssetShelf.tsx): asset browsing and contextual actions.
- [ProposalsPanel.tsx](../../src/components/studio/timeline/ProposalsPanel.tsx): proposal review surface.

These are integration seams, not a claim that all state has already been isolated into small modules. The workspace orchestration remains substantial. Preserve existing lifetimes and authority boundaries when refactoring it.

## Tradeoffs and governing contracts

Stable task domains constrain where a new feature appears; that constraint buys familiarity across selections and effects. Progressive disclosure saves space for the actual media and controls, but must not hide essential tuning behind technical detail. Both workspace layouts must retain equivalent behavior, without pretending their geometry is identical.

Exact domain placement and interaction rules live in [inspector information architecture](../standards/inspector-information-architecture.md), [form controls](../standards/form-controls.md), [catalog layout](../standards/catalog-page-layout.md), and [proposal presentation](../standards/proposal-presentation.md). Browser inspection verifies visual behavior and accessibility; schema and unit checks cannot establish those outcomes alone.

## Responsibility boundaries

The [Library, Proposals and project navigation design study](workspace-surfaces-design.md)
is a superseded study. Retain the current UI as the reference and focus follow-up
work on containers and media display; its companion Pen is not an implementation target.

Follow [application layering](application-layering.md): views emit commands and render
controller snapshots; model modules own pure calculations. UI state such as open
drawers must not replace playback sessions or become a second transport authority.

## Reference storyboards

Reference storyboarding uses the story canvas: one line of beats in the shared
Strip/Script layout preference, with a pacing bar sized by reference beat duration.
Each beat pairs the reference frame with our chosen footage (above it in Strip, beside
it in Script); a beat without footage reads Needs footage and shows as an open pacing
segment. Selecting a beat opens Beat details, a sticky panel with the Reference and
Ours players side by side, footage, trim, our text and Generate. Selecting seeks the
reference player to the beat. On narrow screens the panel stacks below the beats.
The workspace has no toolbar row. The Freeform / Follow reference switch leads the story
section header in both modes, beside Undo/Redo (also Cmd+Z / Shift+Cmd+Z outside text
fields); Add media sits in the media section header. Without a reference, the section
accepts a dropped or chosen video: it is imported as a managed copy, polled while it
prepares, and attached as the reference once valid. A project video or Catalog
reference remains selectable there. The media workspace remains visible above the
reference for source review and marking. Imports are saved in the project Library;
mode changes preserve both plans.

Storyboard cards show the cached thumbnail frame at the shot or beat start (`?w=&t=` on
the media route). Card videos load metadata only until played, so browsing a long
story never downloads every clip.

The reference beat area has no build action, sequence preview, caption
output switch or review checkbox. Reference name/range/text correction is under
Edit reference beat; ordinary adaptation exposes footage, source start where needed,
duration and our text. Existing freeform plans and compiler/proposal contracts remain
stored separately; this consolidation does not discard saved plan content or change
the working timeline.

`ReferenceStoryboard` owns this presentation. It reuses the shared Select popup,
SegmentedControl, InspectorHeading, InspectorDisclosure, ScrubNumberInput,
StoryboardPreview and story canvas styles. The model and serialized storyboard saves preserve source
identity, alternatives and Undo history. Reference footage remains excluded from
compiled output. No automatic effect/audio copying is implied.

Media workspace selection is an independent set of source identities persisted in
`workspace-selection.json`. Per-card Select toggles membership; Clear selection
resets the set. Opening, playing or scrubbing a source does not change membership.
Media cards are not drag sources, so pointer movement on playback controls cannot
start a card drag.

## Story canvas

`StoryCanvas` owns the freeform Our story area. Shots sit on one sequence line with
beats as labels on it; a pacing bar above sizes each shot by duration and jumps to it.
Strip reads left to right for order and rhythm; Script reads top to bottom with each
shot's note editable beside its picture. The layout is a per-viewer preference in
browser storage, never storyboard content or Undo. A transition note renders as a chip
on the line before its shot. Cards stay quiet: picture, number, duration, label and a
note preview. Click opens Shot details, the single home for trim, notes and Generate
assets; Shift/Cmd-click selects shots for Group into beat; pointer drag (the strip or page
scrolls near its edge, and a marker shows the landing point) or Alt+arrow keys reorder; the card menu (⋯ or right-click) and beat menu hold Move, Select, Remove,
Collapse and Ungroup. Layout follows the workspace width (container queries), not the
viewport, because chat shares the window: below 900px Shot details floats as a bottom
sheet over the story and Beat details stacks below the beats.

The chat agent can write the freeform story on request with `storyboard_draft`
([storyboard-drafting](../tools/evolution/storyboard-drafting.md)): one revision-checked save,
so one Undo removes the draft. An open, visible Storyboard page polls a revision-only read
and adopts newer revisions when it has no edit in flight, instead of failing the next edit.
Selection uses the shared Button and MediaGallery owners, does not change storyboard
revision or timeline history, and supports legacy single-source selection records.

Library → Browse images uses that same saved workspace selection. Clicking an image
toggles its selection; the card's Selected label and the fixed selection count expose
the state. Add to timeline and Use in Generate are separate explicit actions.
Generate's reference-slot picker displays project and shared catalog images in the
same gallery. In that picker context, clicking a card fills the requested slot and
returns to the existing generation draft, retaining its task, model and prompt.
Catalog references use a hash-verified managed copy only when explicitly chosen for
Generate. Selection alone does not import, place media or start generation.
`timeline_get.library_selection` exposes selected source identities, labels, URLs
and availability as discussion context, without granting editing authority.

Reference beat source review always plays the full source video. `VideoTrimControls`
uses shared `SliderScrubControl` start/end rows and playhead-mark buttons. Slider
drafts seek the source without saving; release/commit saves one atomic source range,
and Escape restores the previous playhead. Crossing the opposite edge moves that
edge enough to retain one frame; all bounds stay on the 30 fps source-review clock.
Each saved range is one storyboard Undo entry. Trim edits do not remount or shorten
the full-source player. Image duration retains its existing numeric control.


## Generated asset results

Library → Generate → History is a review collection. One `MediaGallery` packs
outputs across requests in newest-first order, preserving natural aspect ratios
and stable job/output keys. Pending requests retain separate status and recovery
controls; they do not force completed results into one gallery per request.

Each completed card exposes playback, Details and Keep. Keep imports into Library;
it does not place the asset on the timeline. Saved cards show In Library rather
than a redundant disabled save button. Details uses the shared dialog presentation
with a text trigger, showing the original prompt, model/settings and references
without expanding a narrow gallery column. Reuse settings lives there and only
fills the creation draft; it never submits generation. Refine, Animate and Compare
are removed from result cards. Image/Video creation and reference selection remain
the canonical homes for new requests.

Generation requests use `GenerationProgress` for visible queue, generation and
result-download stages. Provider queue position and last-check time come from the
persisted job. Elapsed time is display-only. Generation has no invented percentage;
download percentages require a positive response content length, with byte counts
persisted at most once per second during transfer. Unknown lengths show bytes only.
Checking the downloaded artifact remains separate from completion. Missing updates
are visible; they do not imply a failed job or trigger a new paid request.

### Library drawer asset paging

The Browse drawer requests `/timeline/assets?category=…&q=…&offset=…&limit=40`.
Search precedes pagination on the server; counts describe the complete inventory.
Unpaged callers retain the full-inventory response. The drawer renders only loaded
pages, with a keyboard-accessible Show more action at the bottom.
Loading is explicit so thumbnail reflow and scrolling cannot drain the catalog.
Layouts load independently; Generate and Recipes do not request the Browse inventory.

`useAssetPages` caches up to 20 project/category/search results for 30 seconds.
Reopening displays cached pages immediately; stale entries refresh in the background.
Uploads and preparation refreshes invalidate the project's cached queries. Requests
are cancelled on query/project changes and late responses cannot replace the active
query. Errors retain loaded cards and expose Retry. The endpoint still builds the
inventory before slicing; this bounds transport and mounted cards, not disk scanning.

Grab frame captures the currently presented Browser GPU canvas as a PNG, excluding
player controls and safe-zone overlays. It saves preview pixels, not a full-quality
export. Standard/Rust capture remains disabled with an explanation until those
renderers expose a complete capture surface. A synthetic GPU frame download was
visually verified without guides.

The tool rail starts at 52px with 18px icons, 40px targets and 8px spacing, accessible names and hover titles.
Its shared resize divider widens it up to 108px; labels appear from 76px. Double-click
restores icon-only mode. Timeline toolbar order is history, editing, timeline zoom
and lane height, then viewer layout. Playback navigation belongs to the viewer overlay in both layouts.

Timeline scrolling uses the shared OverlayScrollbar over a native scroll viewport
with no reserved scrollbar gutter. Pointer dragging, wheel scrolling and keyboard
scrolling use the same scroll position. Ruler painting, lane offsets, fitting and
hit testing share `timeline-geometry.ts`. Playback navigation is centered on the composition rather than the entire workspace, and floats above its bottom edge. Model selection and connection remain with chat, separate from preview settings in the project header.

### Projects dashboard

`ProjectsDashboard` owns separate Dashboard and Projects views, with search, Guide and User in the sidebar. Dashboard centers a new-project idea draft above six recent project cards; Projects shows the full searchable collection. Project creation lives in the central dashboard composer, which can start from an idea or an empty draft; the collection contains existing projects only. Cards use lazy-loaded existing local source media as previews (not rendered timeline covers), with title and recency below. It reuses `ProjectList`, the existing creation dialog, `GuidePageContent` / `GuideCatalog`, and `EditingMemoryPage`. DreamCut in the editor header returns here with the current project context. Guide and User render outside the editor shell; their legacy project routes redirect here. A visible project-context header keeps project-specific preferences explicit; sidebar search results switch that context. Personal and project data continue through the existing memory APIs. Navigation never edits a timeline. The central composer accepts an idea and removable image/video/audio attachments. It opens the existing creation dialog; after creation the idea transfers through project-keyed session storage into the editor composer, without sending a Codex turn. Attachments import through the existing managed uploaded-assets endpoint into the library, never the timeline. Partial failure retains the created project and completed uploads; retry skips those files. The prompt has no manual resize handle. Browser users can stage the idea, but sending still requires the desktop chat bridge.

Standard Capture frame sends the current composed edit snapshot and absolute player frame to the local capture endpoint, reusing the settled browser still renderer. It downloads a PNG at composition dimensions without guides or controls, including current preview edits. Browser GPU retains direct canvas capture. Capture pauses playback, disables repeat clicks while working, and exposes errors in the settings menu. Rust capture remains unavailable. Temporary render files are removed after the response; capture does not modify the project. Standard capture settles its own still independently of prepared playback. Desktop captures authenticate their dedicated render browser to the local service; the session credential is never included in composition inputs or the PNG.

The DreamCut brand and adjacent Dashboard tab both return to the dashboard. The chat composer marks group fills the available row, distributing its actions across the width. Dock tab buttons stretch to the entire inner container height; only the parent clips rounded corners. Connected desktop chat uses the shared NativeSelect for Codex models. Connection reads the installed Codex model catalog; the host accepts only catalog model IDs and applies the selected ID on the next turn without changing tool permissions. Model selection does not send a message.

`WorkspaceTabs` owns the single sticky header above the dashboard and editor, including the brand and Dashboard/open-project navigation. `WorkspaceChromeProvider` supplies hydrated DOM slots for project navigation, preview settings and Export; callback refs prevent portals from racing Suspense hydration. The dashboard sidebar does not repeat the brand. On macOS Electron the native title bar is hidden, with traffic-light controls and a draggable background sharing this row; interactive controls remain non-draggable. Open tab IDs persist for the window session; closing a tab only removes navigation, never project data. Embedded and render routes omit this chrome. Dashboard source previews reserve their dimensions and show a loading placeholder until media is ready; labels remain below.

The vertical workspace places Library/Properties above the timeline in the left column, with the viewer in the middle and Chat/Proposals at the right. The left editing column and timeline height retain bounded shared resize handles; vertical editing width has a separate persisted key from the previous viewer-left layout. Horizontal workspace arrangement is unchanged.

### Inspector navigation and viewer sizing (2026-10-09)

The tall viewer resize range stops at the width required to fill the available height at the composition aspect ratio; unused width returns to the editing column. A minimum editing width remains, so very small workspaces can still be width-limited. The output aspect ratio is unchanged.

Captions in the tool rail opens the existing speech-caption workflow and saved caption assets. Selecting an existing caption opens its Properties; creation and selected-caption formatting remain distinct. Media categories use a non-shrinking, horizontally scrollable tab row, with arrow-key focus bringing offscreen categories into view. Caption X/Y and box-width rows put their labels above the slider and exact entry to fit narrow panels.

Transition duration and direction precede the type chooser. Large transition and animation choice sets initially show a bounded subset including the active choice; Show all exposes the complete set without changing the edit. Stabilization is an optional Effects disclosure, separate from entrance/exit Animation controls. Recipes still owns compound workflows; adding global Text, Transitions or Effects browsing destinations requires their own selection and insertion contracts and is not part of this navigation patch.

### Generate form (Library panel, editor drawer)

Decided 2026-10-12. The project sections are Editor · Storyboard · Library; there is no
Generate section, and `/p/<id>/generate` redirects to `/p/<id>/library?generate=create`
(`?generate=results` opens Results). One form, `AssetGenerationDrawer`, serves every
placement through `presentation`: in Library it is a docked right-hand panel beside the
asset grid, resizable (`WorkspaceResizeHandle`/`usePanelSize`) and hideable to a
full-width grid (`LIBRARY_GENERATE_PRESENTATION` in `LibraryCatalog.tsx` switches it to a
drawer in one line); in the editor it is a tab of the Library drawer, which opens from the
header in both layouts with two tabs, **Library · Generate**, and shows Generate in place
(`inlineGenerate` on `AssetShelf`). Restored 2026-10-13 to the pre-Oct-12 shape (one Library
drawer with Generate inside): the Library, Music and Sounds tabs left Wide's tool rail, which now
holds Captions, Text, Templates, Layouts and Properties, and Generate no longer slides out a drawer
of its own. After that day's UX audit, Music and Sounds became Library sub-tabs: one row,
**Images · Video · Music · Sounds**, shares the search field, an Import icon (which adds to the
active kind and switches to Your media) and **Your media / Catalog** (the asset page splits music
and sounds by source like pictures). Music and Sounds use one row layout (`renderAudioRow`), with
details folded behind each row's arrow. Generate's own tabs are Image · Video · Motion; past
generations open from a History link. Draft, price, balance, sign-in/credits gating and staged-draft behaviour are identical
in every placement.

While the form is open, clicking a project image in the Library grid fills the slot the
form asked for ("Choose from Library"), or offers the model's allowed roles. Results not
yet kept appear at the top of Images or Video as New from Generate as they arrive.

An agent-staged draft (`asset_generation_prepare`) brings the form up once per staging:
`ProjectShell` watches the shared poll's `stagedId`, takes the draft present on the first
visit as the baseline, and opens Library with the form, or, while the creator is typing or
media is playing, shows a quiet Generation draft ready notice instead. The open form tells
the server it displayed the staged draft, which chat approval requires.

The Chat/Proposals dock appears only in the desktop app (`window.dreamcutDesktop`) and only
beside Storyboard; a browser driven from Claude Code or Codex has its own chat. The editor
keeps proposals in its own drawer.

The project header reserves the same settings/fullscreen and Export widths in every
section. Outside Editor those controls remain visible and disabled, preventing
navigation from moving the header when the player unmounts.

#### Generate marks, iteration and chat context

In the desktop app's dock, Generate reuses the editor's Marks control (`FrameTagControls`) in the chat composer.
M marks the image or video last clicked or played (videos at their current moment); the
crosshair arms one point mark on any reference, result, Library image or video frame
(`MarkableMedia` under `GenerationMarkingProvider`). Each mark keeps its source, visible
name, optional point (normalized x/y) and video time, plus the creator's note. Marks are
part of the saved draft (`assetDraftSchema.marks`), survive agent restaging unless the
agent restates them, and are never sent to providers. Iterate on a result loads that request's settings with the
result as the next edit/start reference. Recent prompts restores earlier prompts from
this project's requests. A launch from another page (Properties, Storyboard beat) that
replaces the draft offers Restore previous draft.

Generate and Storyboard publish page context to the dock chat through
`useProjectReviewDock().setPageContext`. The chat shows it as a removable chip, offers
one-tap suggestions, and attaches the context text (draft, references, marks, latest
result; or beats and missing footage) to each message, while the conversation shows
only what the creator typed. The agent revises a generation draft with
`asset_generation_prepare`, and generates only on the creator's Generate click or their
explicit approval in chat (`asset_generation_submit`).
