# Library, Proposals and project navigation

Status: **superseded — do not use the companion Pen as an implementation reference**, 2026-10-07.

Creator correction: retain the current navigation and interaction model. The requested follow-up is a bounded cleanup of containers and media display. Do not introduce the proposed taxonomy, inbox/detail migration, or new search UI. Search is outside the cleanup scope; existing search behavior is unchanged. The responsibility inventory below remains historical analysis, not accepted design direction.

Original study: This document and the companion Pen describe a target experience, not shipped behavior. Existing authority remains in [editor UI](editor-ui.md), [proposal presentation](../standards/proposal-presentation.md), [catalog layout](../standards/catalog-page-layout.md), and [Properties versus recipes](properties-and-recipes.md).

## Outcome

A creator should be able to find material, ask for a treatment, review the result, and continue tuning the applied edit without learning a different navigation or control system at each step. The immediate priority is the Library slide-out and Proposals. Storyboard, Guide and User need explicit roles so these drawers do not become catch-all workspaces.

This is design work only. No project edit, generated asset submission, production navigation change or approval is part of this deliverable.

## Evidence and limits

The current source was inspected, including AssetShelf, LibraryCatalog, LibraryEffectCatalog, AssetGenerationDrawer, EffectAgentRequest, ProposalsPanel, TimelineStep, MediaDrawer, ProjectShell, GuideCatalog and EditingMemory. Earlier Properties walkthrough documentation and the existing Pen were read. Browser inspection was rejected by the browser tool's URL security policy on this turn; no alternate browser path was attempted. Current visual behavior, scrolling, keyboard interactions, themes and responsive fit are therefore **unverified**. Findings below explicitly identify source evidence or a design inference.

The existing `design/openedit-create-panel.pen` contains older Properties boards whose on-disk labels disagree with the latest walkthrough notes. Preserve it. Use one focused companion `design/workspace-surfaces/workspace-surfaces.pen` for this scope; its screen index is the current design set, not a collection of competing versions. Synthetic examples keep project media out of design source.

## 1. Surface responsibilities and user stories

| Home | Purpose and why it earns a home | Creator story / observable success | Does not own |
| --- | --- | --- | --- |
| Editor | Work on the current cut in time. Preview, timeline and selection belong together. | As a creator, I can find a moment, select its clip, change a value and undo one change. | Asset generation forms or a catalog of agent workflows |
| Properties | Persistent values of the selected applied item. | I can select an applied glow and reduce its strength without reopening a proposal or chat. | Choosing new compound recipes; approving drafts |
| Library drawer | Find or prepare something while retaining the edit's context. | I can preview a source, see where it would be added, and deliberately insert it. Closing and reopening keeps my search and selection. | A second edit history, proposal approval, or hidden automatic placement |
| Full Library | The same library in a larger workspace for sustained source review and organization. | I can expand the drawer without losing its mode, filter, scroll or selected asset, then return to the same editing moment. | A second taxonomy or a different copy of the catalog |
| Library → Media | Existing usable material. Search and media filters narrow one collection. | I can find a video by subject, inspect its full source, and distinguish project media from catalog material. | Recipe construction controls or unfinished jobs masquerading as ready media |
| Properties → Templates | Reusable treatments that coordinate editing building blocks. | I can see an example, learn the required inputs, choose a target and prepare a request for my agent. The result comes back in Proposals. | One-click application of a treatment that needs agent work |
| Library → Generate | Create a new image/video asset with explicit prompt, references, model and cost. | I can review a draft before submitting, leave while it runs, and inspect the result before keeping or using it. | Timeline approval; silently changing model on retry |
| Proposals | Decide whether candidate changes should enter the working cut. | I can understand a change, compare it with the current cut, tweak it, and apply exactly the named edit or selection. | Discovery catalogs, permanent effect controls, duplicate Undo/Redo |
| Checks (within review) | Inspect supported diagnostics and uncertainty. | I can jump to the affected time, understand the finding, and decide what to do. | A generic green quality badge or automatic fixes |
| Storyboard | Plan shot order, intent and source choices before committing a sequence. | I can compare a reference beat with my replacement and prepare a reviewable sequence without disturbing the current cut. | Precise keyframe editing or another asset library |
| Guide | Learn the product and editing workflows. | I can understand how a treatment works and open its canonical recipe with context. | A duplicate executable recipe catalog |
| User | Personal defaults, ideas, skills and computer settings across projects. | I can see whether a preference is personal or project-scoped and change it deliberately. | The project's pending edits, timeline history or export review queue |
| Edit history | Recover and understand committed changes. | I can see what was applied and undo through the existing history owner. | Pending proposal decisions |
| Export | Explicit delivery action from the current cut. | I can review output settings and start a render deliberately. | Library creation or preview-quality settings |

### User subsections

- **My style:** active preferences and suggestions, each with scope and provenance. Current direction wins; accepting a suggestion is explicit.
- **Video ideas:** references, concepts and capture notes across projects. Saving an idea neither creates a project nor changes style.
- **Skills:** installed guidance and personal copies. Clearly distinguish installed, available and active; a saved copy is not proof of assistant activation.
- **Settings:** appearance, shortcuts and preview behavior, with computer/project scope shown. Export quality stays in Export. Advanced engine controls remain optional settings, not editing categories.

## 2. Navigation model and grouping rationale

Keep the existing project navigation: **Editor · Storyboard · Library · Guide · User**. These are different sustained activities. Library and Proposals drawer buttons remain editing tools; Proposals does not become another top-level project page.

Library uses **Media · Recipes · Generate**, in both page and drawer. These tabs earn their separation because they have different objects and completion actions: use an existing asset, request a coordinated treatment, or submit new generation. Rename Browse to Media to name the object being explored. Keep one active mode and one shared saved browsing state per project.

Within Media, **All · Video · Images · Audio · Text** are filters over a collection, not another tab workspace. Type, origin and search belong on one compact filter surface; on a narrow panel, use a labeled filter disclosure with a persistent active-filter summary. Audio's Music / Sound effects / Voice choices are secondary filters revealed only for Audio. Counts describe the current scope. Never show three equally prominent navigation rows.

Text is a creation entry and reusable text material, not another copy of all applied captions. “Create captions” opens a focused source/language/replacement task. Properties edits existing text. Import stays a labeled action, not a fourth Library tab. “Book” becomes a named collection if that project supports it; it is not a universal media type. Layout templates that orchestrate multiple actors become Recipes. A single directly editable shape/text primitive can remain in Text. Do not hide existing capabilities without mapping each entry.

Use **sections** for coexisting settings that the creator needs to compare (prompt, references, output settings; a proposal's target, tweaks and effects). Use **disclosures** for optional detail (provenance, advanced adjustments, job diagnostics). Use **item → detail navigation** for an identifiable object (asset, recipe, proposal). Reserve tabs for substantial alternate tasks. Image / Video in Generate is an output-type choice inside a single form; Results is a saved-job destination, not another layer of three tabs above the form.

Guide's Overview remains an orientation page. Rename its Effects subsection **Examples** and make “Open recipe” route into the same recipe record in Library. Keep learning content in Guide and executable requirements in Library. This changes presentation ownership, not stored recipe identity. User tabs remain because their data, scope and actions are distinct.

## 3. Library drawer contract

### Shell and space

One header: **Library**, Expand to Library, Close. One mode row below it. One scroll owner for the active content. A contextual action footer appears only when a selection/task needs it. Keep the shared slide-over behavior: opening a drawer does not resize or remount the underlying editor/player. Tall editor retains preview left and timeline/Properties right. Wide editor retains upper preview/Properties and full-width timeline below; the slide-over overlays the right side in either layout.

Target widths: normal 480–600 px; compact 360 px. Below 400 px, filters condense and cards become single-column. At narrow viewport widths the drawer may occupy available width with a visible return-to-editor affordance; do not pretend both canvas and full drawer remain usable side by side. Width is workspace preference, not video aspect ratio. Full Library expands the content area and media gallery, without changing mode names or behaviors.

### Media flow

1. Search/select scope and type. Empty collection says Import media; no matches says Clear filters. Failed loading offers Retry without clearing context.
2. Selecting a card opens its detail; selection itself does not insert or edit. Video/image previews preserve intrinsic aspect ratio. Audio rows use waveform, duration and one play action; stop the previous preview when another starts.
3. Detail shows name, project/catalog origin, readiness and a source preview. Video has a source-range control; audio has waveform/cue information. Preparation is visible and insertion stays unavailable until required readiness is satisfied.
4. Footer names the consequence: **Add at 00:12.4** or **Replace selected clip**. Replacement is a distinct explicit action, never silently inferred from selection. When opened outside the editor, preserve a known target or say **Use in Editor**; never invent a playhead.
5. Import, preview, selection and source marks do not place material. Human Add uses the supported undoable edit path; an agent request uses proposal authority.

Source notes, metadata, analysis and extraction live in asset detail under relevant sections. Rhythm analysis opens from audio detail. “Found for you” is a named saved result set inside Media, with its query/context and Clear results; it should offer an “Open results” notification rather than forcibly navigating away from editing.

### Recipe flow

Catalog tiles show a real available example, name and a short outcome; unavailable examples say so. At drawer widths, example and description stack vertically. Selecting a tile opens requirements, target and direction. “Prepare agent request” reveals an editable handoff. Current integration only supports copy/paste (`EffectAgentRequest`), so the concrete CTA remains **Copy agent request**, with “Continue in chat; nothing applied.” A future “Send to agent” button needs a real bridge, dispatch/error state and explicit user submission; it is not implied by this mockup.

Source preparation and compound effects stay here. Fine-tuning a proposed result stays in Proposals. After approval, the same supported parameter identities appear in Properties. A library recipe being available does not imply a renderer/operator can apply it instantly.

### Generation flow

Single vertical form: output type → prompt → references → model and output settings → estimate → explicit Generate action. Keep meaningful settings visible; optional provider details go in Advanced. Reference picking temporarily enters Media with a visible “Choose reference for …” header and Return/Cancel, then returns to the preserved form.

Draft, Running, Ready and Failed are distinct states. Results has a persistent count/status entry from Generate; selecting a result opens preview and reusable prompt/reference details. Retry preserves model/settings unless the creator changes them. “Keep in Library” retains the result and starts preparation where needed; it is not timeline placement. “Use in Editor” is separate and gated on readiness. Closing does not cancel jobs or discard drafts. Estimates and provider availability must come from the real registry at implementation time.

## 4. Proposals contract

### Inbox first, details on selection

Pending list rows show the result title, affected range/target, Ready / Needs attention state, a checkbox for batch inclusion, and an Open action. Only the active proposal exposes its tweaks. This reduces repeated buttons and vertical stacking; opening detail is separate from including a proposal in a batch. Draft revisions fold under their latest successor.

A fixed footer explicitly names its scope: **Preview 2 selected** and **Apply 2 selected**, or **Preview this edit** and **Apply this edit** in detail. Never show an unlabeled Apply beside several possible scopes. The detail header says “Reviewing one edit”; returning to the list restores batch selection. A single persistent comparison control labels **Current cut / Proposal**. Avoid ambiguous “Live” and repeated comparison buttons inside every card. Display “Preview only — current cut unchanged” while candidate preview is active.

One result is the default. Alternatives use a labeled mutually exclusive choice set within the same decision, with separate Recommended and Selected indicators. Independent edits remain separate checkboxes. Conflicting selections block batch apply and identify the conflict; they never silently apply sequentially. Do not preselect newly arriving proposals while a creator is inspecting another selection.

### Tweaks and completion

Main tweaks are immediately visible under the selected result, using the same labels, units and shared controls as Properties. Advanced adjustments contains remaining supported controls; change detail/audit information is separate. Draft slider/typing changes update the paused candidate. Escape cancels the unfinished gesture. Reset restores the proposed baseline, not the original working-cut value. Saved tuning survives leaving/reopening. Human approval carries those exact values into the timeline; one approval/batch = one Undo through the existing timeline owner.

An empty inbox says “No edits waiting for review” and points to asking for an edit. Preparation failure has Retry preview without losing tuning. A stale proposal disables Apply with a concrete explanation and Prepare revision request. Do not label it “Rejected.” Applied/rejected history is a link/disclosure in the review surface, not part of the active queue count. Reject is a distinct secondary action scoped to the active decision and its linked revisions.

Checks stays a sibling review tab because diagnostics are a different task from choosing a candidate. Current source mounts **color continuity** conditionally; do not pretend it is a complete project-quality system. Label actual finding type, time, evidence and unresolved status. “No supported findings” is not “Video is perfect.” Findings about a proposal are attached to its detail; global findings stay in Checks. No unsolicited automatic repair.

## 5. Storyboard, Guide and User layouts

Storyboard retains Freeform / Follow reference modes. Use source review plus ordered beat strips, selected-beat detail and a clear prepare-proposal action for existing cuts. The reference is source evidence, not output media by default. Text, source range and duration are sections for the selected beat; no extra per-field tabs. Full source and selection stay visible when space permits and stack in the same reading order when narrow.

Guide uses one page scroll and a concise orientation map. Examples link to Recipes rather than duplicating construction controls. User uses one page scroll, scope labels and short editable records; long explanations move to disclosure. Settings uses sections, not new nested tabs for each subsystem. Both share project navigation, theme tokens and the segmented control owner.

## 6. Source-backed audit and priorities

| Rank | Evidence / current owner | User impact (inferred unless stated) | Proposed remedy | Acceptance |
| --- | --- | --- | --- | --- |
| P1 | `AssetShelf` uses Browse/Generate/Recipes plus media sections; `LibraryCatalog` instead leads with Stills/Video/Music/Sound effects. Source finding. | Expanding the same named Library changes the mental model. | One controller and mode vocabulary across drawer/page. | Expand/return preserves mode, query, selected item, origin and scroll. |
| P1 | `AssetShelf` renders workflow, media-type and Audio detail rows before content. Source finding. | Small drawers spend height on navigation instead of choices. | One mode row, compact filters, audio subtype as filter. | Audio remains findable at 360 px without three tab bars. |
| P1 | `ProposalsPanel` renders batch Apply/Replay and per-option Apply/Replay/Live. Source finding, prior screenshots also show repetition. | Approval scope competes visually with preview. | List/detail pattern and one explicitly scoped action footer. | Reviewer can state what will be applied before clicking. |
| P1 | `LibraryEffectCatalog` recipe rows use two equal columns, regardless of drawer width. Source finding. | Examples and requirements compete for narrow horizontal space. | Stacked tile/detail presentation in the drawer. | Read title, example and requirements without horizontal overflow. |
| P1 | `ProjectShell` pushes to Library when a new presentation arrives. Source finding. | An agent result can interrupt an unrelated editing task. | Non-disruptive result notification with Open action. | A new result does not change route/playhead without user action. |
| P2 | `AssetShelf` music has inline Add, detail Add and a separate footer, with fixed 187px detail scroll region. Source finding. | Competing action locations and nested scrolling. | One selected-asset detail and scoped footer. | One insertion action; wheel/key scrolling has predictable owner. |
| P2 | Library page uses Stills, shelf uses Images; Guide says Effects, shelf says Recipes. Source finding. | Names imply different inventories or abilities. | Images consistently; Guide Examples → canonical Recipes. | Same item identity and availability across entry points. |
| P2 | Shelf section type includes captions; primary `SHELF_SECTIONS` omits it. `captionGeneration` is passed by TimelineStep. Source finding; reachability needs live verification. | A supplied capability may be undiscoverable in normal navigation. | Visible Text → Create captions task with source choice. | Creator finds caption creation unaided; no duplicate inspector button. |
| P2 | Generate is embedded through shelf and page opens that drawer; current request handoff is copy-only. Source finding. | Creation/result states and agent execution can be misunderstood. | Shared form/results owner; explicit copy handoff semantics. | Selecting recipe/generation draft does not send, pay or apply. |
| P2 | Form standards and current numeric code differ in some older descriptions. Source/document finding. | New surfaces can reproduce obsolete tiny controls. | Use current shared numeric owner; refresh diagrams with migration. | Same value/units/gesture/reset behavior in proposal and Properties. |

## 7. Shared components and state

Reuse `SlideOutDrawer`, `DrawerHeader`, `DrawerCloseButton`, `SegmentedControl`, `MediaGallery`, shared `Player`/`PreviewControls`, `InspectorHeading`, `InspectorItemHeader`, `InspectorDisclosure`, `InspectorPropertyControl`, `SliderScrubControl`, `ScrubNumberInput`, shared Button and Select owners. No local numeric fields, browser-theme dropdowns or custom tab grammar.

Extract a shared Library workspace controller from current mixed page/shelf responsibilities; it owns mode, source query/scope, selection identity, detail stack, draft references and result routing. Source records, generation jobs and editable timeline data keep their existing storage owners. The drawer/page are views, not independent state stores. Preserve media clock and playback session lifetime across navigation. Generation tasks continue after closure. Proposals keeps its own candidate selection/tuning controller and shared derivation/approval contract.

Target interaction sizes: regular controls 40px high; compact numeric clickers at least the shared 32px size; 44px touch targets where touch is supported. Strong visible keyboard focus. Selection uses shape/text as well as color. Source menus inherit light/dark surfaces; media pixels are unchanged. Tab navigation uses arrows/Home/End; filter buttons expose pressed state. Escape closes the innermost transient surface or cancels its active gesture, then returns focus to the opener; it never discards a saved proposal or submits a form.

## 8. Migration and acceptance

1. Shared shell, names and Library state parity; retain old URLs as aliases. No media migration.
2. Media list/detail and explicit insertion; preserve readiness, provenance, source marks and Undo.
3. Recipe detail and generation/reference/results flow; retain copy handoff until a bridge exists.
4. Proposal list/detail, scoped actions, comparison and stale/conflict states; preserve audit records and tuning.
5. Guide links, User scope and Storyboard visual consistency. Do not silently change learning defaults.

Before production acceptance: run `pnpm check:editor-ui`, `pnpm typecheck`, related state/controller tests and proposal approval/undo contract tests. Exercise tall, wide and 360px panels in both themes; source video, image, audio, text, empty/error/preparing states; proposal single/alternatives/batch/stale/conflict. Test keyboard, close/reopen, resize, canceled gestures, reset and Undo on disposable data. Have a fresh visual-only reviewer first predict task locations, then find a clip, prepare a recipe request and review/tune an edit without coaching. Agents never approve a creator's working proposal for this test.

Current evidence: source audit and generated mockup structure checks only. Browser visual acceptance, native Pen application rendering and live usability are **unverified**. Design preview art is illustrative; it does not demonstrate playback, generation, agent dispatch or persistence. No production gates were run for these design-only files; baseline gate results from previous turns do not validate this design.

## Design coverage

The companion walkthrough contains Media, video detail, audio detail, Text/captions, Recipes/detail/request, Generate image/video/results/failure, Proposals inbox/detail/alternatives/stale/checks/history, full Library, Storyboard modes, Guide sections, all four User sections, and empty/recovery states. Tall, wide and compact drawer boards are included. The prototype is a clickable navigation model with simulated controls and explicit design-only status. It does not claim production behavior.
