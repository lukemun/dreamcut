# editor-ui-design — evolution log

## Purpose

Make new editor capabilities feel like parts of one product. This procedure covers finding a creator task's home, consolidating controls, preserving editing semantics and verifying discoverability across selections and layouts. It succeeds when another contributor can integrate a feature with explicit ownership and reviewable evidence; it does not direct a video edit or certify rendering fidelity.

## 2026-10-07 — Nontechnical creator judge

- **Observation:** The creator requested an independent UX reviewer for older, nontechnical users, identifying media-import discoverability and user-facing documentation as concerns. These concerns are user reports, not a completed usability trial.
- **Decision:** Extended the existing fresh-eyes workflow with a reusable judge brief covering documentation, readability and UI task completion, including importing several videos and selecting a subset. Preserve audience boundaries for developer docs and report missing UI separately from unclear instructions. The user explicitly requested this skill update.
- **Verification:** Routing walkthrough: a Guide/media UX audit uses the judge; a timeline edit continues to use proposals; unavailable browser or independent reviewer yields unverified task completion. These are written walkthroughs, not a live judge trial. Skill discovery and link validation are checked for this documentation change; no runtime judge or UI implementation is added.

## 2026-09-29

- **Observation:** The creator reported increasing Properties fragmentation after the speed-effect integration. Inspection found blur controls mounted under a section excluded by the display-label filter, despite an existing information-architecture standard.
- **Decision:** Added a repository workflow and feature integration standard under the creator's explicit request for a skill, audit and enforcement. Replaced label-based section routing with required stable identities and a tested registry. Broader panel consolidation remains a staged rework, not an accomplished redesign.
- **Verification:** Applied the workflow to the speed control discovery issue. The original test receipt is retained privately; the current component contract is [shared editor controls](../../../docs/standards/editor-controls.md). Matching request: adding an effect dial requires this workflow. Neighbor: changing a video's blur value routes to editorial proposals. Missing app: code audit proceeds with visual evidence marked unavailable. These routing cases are written walkthroughs, not independent agent trials.

## 2026-09-29 — unaided human editing

- **Observation:** The creator explicitly required that a human can understand and tweak an edit without AI assistance, and proposed a fresh agent with only the visual interface as a discoverability check.
- **Decision:** Made human independence a core feature-integration principle. Added an outcome-only, visible-UI acceptance procedure with independent context, disposable fixtures, observable changes and Undo. Clip structure is judged by the editing task rather than a blanket preference for continuous clips or cuts.
- **Verification:** Checked document links and skill-purpose/catalog discovery. No independent visual trial was run for this policy change; existing Properties usability remains unverified against the new criterion.

## 2026-09-29 — keep keyframes in Properties

- **Observation:** The creator rejected the replacement keyframe inspector and Back to Properties navigation. A technically editable single source track did not make the effect's individual moments understandable.
- **Decision:** Keep domains and ordinary controls visible during keyframe inspection; share row actions with blur controls and support the existing offscreen position range. Prepare an atomic source-backed section proposal for the working timeline and use a disposable copy for independent UI testing.
- **Verification:** Seven focused routing/navigation/range checks pass and typecheck passes. Independent visual trial and its limitations are recorded in the Properties cohesion audit; implementation checks alone do not establish usability.

## 2026-09-29 — reusable controls and detection corrections

- **Observation:** The creator asked to remove the rhythm viewer's Last 10s shortcut and preserve it as a UX anti-example, then requested missing-hit authoring.
- **Decision:** Audit arbitrary session-derived shortcuts against existing general controls. Documented Last 10s alongside the Start/End/zoom/Fit controls it duplicated. Detection tools need an explicit manual correction path with draft review and reversible saving.
- **Verification:** Removed the shortcut and added per-instrument hit authoring. Targeted tests and UI evidence are recorded in `testing/results/rhythm-manual-hits/review.json`; broader layout coverage is listed there rather than implied.


## 2026-09-29 — Route all UI changes through shared presentation owners

Observation: section titles were weaker than effect names, and Video scopes used
a full-width action button. The shared hierarchy components now exist, but agents
needed an explicit entry path to use them on styling fixes as well as new features.

Decision: broaden AGENTS.md routing and the skill trigger to all editor UI changes;
require component-map selection before JSX edits; link canonical owners and
verification rather than create a parallel skill. User explicitly requested this
setup. Keep source-gate results distinct from visual-only usability evidence.

Verification: checked component paths and instruction links; ran skill-purpose,
skill-catalog and editor UI gates. Routing walkthrough: a title/scopes styling
request reads this skill and hierarchy map; a numeric effect addition also uses
the numeric gate; a timeline-only editorial request stays with proposals. If the
browser is unavailable, implementation checks continue and visual acceptance is
reported unverified. This walkthrough is not a new independent usability trial.

## 2026-10-09
- **Observation:** For repeated duration parameters, provide one compact shared main control in seconds, place per-item overrides in Advanced, and keep frame counts secondary. Evidence: feedback:7b1d1bb3204afc211ab1e4432add04d2741836515b6b6ceb7c38b8ed00e94b63, feedback:b056f952bd05bdf7f7066f62351c1a11d765097a4027a4fb5a5a9677ebae41aa, 20261002T030455-fc17d4e4.
- **Decision:** Updated — Approved Memory improvement `f4e1e44cfdaec5c6851c55a7505a0a6862ee19bfb7493e8827450500257c5f6c` from retros `d688c0da-57f9-4922-a249-9a2bbddd9e10`. Reconciled candidates: f4e1e44cfdaec5c6851c55a7505a0a6862ee19bfb7493e8827450500257c5f6c.
- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.

## 2026-10-23 — Catalog footer audit case

- **Observation:** A narrow catalog layout was visually inspected and accepted despite an action-only Details row with empty space, repetitive metadata and a selection checkmark that shifted the title. The creator explicitly rejected it and requested a UX audit eval case.
- **Decision:** Added the bounded catalog-card visual case and linked it from the UI skill. Corrected the card implementation; retained selection semantics. This addresses a missed judgment as well as rubric coverage.
- **Verification:** Manual case prepared; no independent evaluator trial or human acceptance of the replacement is claimed. Implementation checks and browser evidence are reported in the task receipt. The case is distinct from timeline-editing model benchmarks.

## 2026-10-23 — Preserve preview shape during footer correction

- **Observation:** The next revision used uniform-width cards with small portrait previews, wasting side space and leaving previews flush against the top. The creator rejected it. The prior receipt explicitly had no independent acceptance result.
- **Decision:** Extended the same catalog case with intrinsic aspect-ratio and balanced preview inset criteria. Restored naturally packed cards and consistent preview insets; removed the unused uniform-gallery option.
- **Verification:** Actual browser and independent visual review results belong to the local task receipt. This entry does not imply human acceptance or a broad UX pass.

## 2026-10-23 — Row alignment and open-trigger audit case

- **Observation:** A proposal option row shipped with its checkbox, key chip, label and time range at different heights (`items-start` plus per-item `mt-*` nudges), and the Edit history button looked identical open and closed because the header's `background: transparent !important` erased the `aria-expanded` fill. Neither was caught before the creator saw it; the creator asked for a UX audit eval case.
- **Decision:** Added the measured `row-alignment-open-trigger-v1` case and required it for every UX audit and for changes to mixed-size rows or menu triggers. Fixed the row with line-height boxes and a shared text baseline; the history button now takes the open-drawer selected fill, which hover no longer replaces.
- **Verification:** Measured centers in the running editor (checkbox, key and label equal; time shares the label baseline) and confirmed the open history button uses `--chrome-selected-bg`. No independent reviewer trial or narrow-width wrap check is claimed.

## 2026-10-23 — Page header way-back case

- **Observation:** Project history's header stacked "← BACK TO EDITOR", the uppercase project name and an icon tile above the title. The back link was styled exactly like the label under it, so the creator could not tell there was a way back and found the header dense.
- **Decision:** `PageHeader.back` now takes `{ href, label }` and always draws an outline button with an arrow on its own line; Project history drops the icon tile and shows the project name under the title in normal case. Added the `page-header-way-back-v1` audit case and linked it from this skill.
- **Verification:** Measured in the editor with the source rule applied: back button on its own line above the title. The shared dev server served a stale global stylesheet, so a fresh load was not confirmed; Library, Guide and template draft headers were not re-inspected. No independent reviewer trial.

## 2026-10-23 — Catalog panel toolbar

- **Observation:** The editor's Templates panel stacked four control rows above the first card: Templates/Looks, All/Yours/Shared with counts, a full-width "Columns 1 2" row, then search, followed by a "Your templates" heading that repeated the Yours filter. The creator called the top cluttered.
- **Decision:** The panel top is two rows: search with a one/two-column icon toggle (and the drawer action), then Templates / Looks. The ownership filter is gone; the existing Your/Shared sections carry ownership. Added both rules to the catalog card audit case and updated recipe-visual-presentation.md.
- **Verification:** Inspected in the editor panel at its docked width. Still open: two-column card titles wrap one word per line beside Details (fails the case's usable-title criterion), and "Templates" repeats as panel title and first switch option. Expanded drawer and the home page catalog were not re-inspected. No independent reviewer trial.
- **Follow-up (same day):** Two-column card titles no longer wrap one word per line: below a 200px card width (container query) the Details button becomes a 28px chevron with the same "Details: <title>" name and tooltip, so the title keeps roughly 50px more. Wider cards and the page keep the word. Checked at the docked panel width in one and two columns.
- **Follow-up (same day):** The creator found panel previews too small and the selected card's ring heavier than the Proposals button's selected state. Panel previews now run edge to edge (8px inset removed, panel padding 16→12px, gap 14→10px: 123→145px wide), the focus ring draws inside, and the selected card uses the selected fill with a thin ring and no 2px outer glow. Both rules were added to the catalog case. Checked in the docked panel; the expanded drawer was not re-inspected.

## 2026-10-23: colour grading audit

- **Observation:** An independent creator-eyes reviewer completed 5 of 6 grading tasks in the new grading controls, and only part of the proposal-card task. The tools worked, but they were hard to find and labelled with jargon. Wheel names sat apart from their wheels. A plain click on a clip recorded an invisible edit. The creator also pointed out two things the reviewer did not flag: scope captions in internal terms ("SDR brightness %", sample counts) and browser-native dropdowns.
- **Decision:**
  - Added a wording-reduction step to every audit, since reviewers rarely flag text that shouldn't be there.
  - Made the app's own dropdown the rule.
  - Added a `group` layout to `InspectorPropertyControl` (outlined box, name and actions on one header line) for wheels, curves and multi-row controls.
- **Verification:** Fixed and re-checked in the editor panel at its docked width, including one wheel drag plus one Undo and a no-change click that no longer adds history. Not rerun with a fresh reviewer.

## 2026-10-23 — Review action row case

- **Observation:** While a single-option proposal card was previewing at the Proposals panel's docked width, its action row broke. Reject wrapped alone onto a second line, and the Preview button showed only loading dots, so it read as a blank control. The creator said this should never happen. Cause, from the code: the colour grading audit made every action word always visible, but the row was also changed from `flex-nowrap` to `flex-wrap`. Four worded buttons no longer fit, so Reject (`ml-auto`) dropped to its own line. The loading state hides the icon and word and shows dots in the same cell. The row alignment case did not catch it, because it checks heights within a line, not whether buttons stay on one line.
- **Decision:** Added the measured `review-action-row-v1` case and linked it from this skill for every UX audit and for button rows whose set or labels change with state. It fails a wrapped button, a hidden or truncated word, a dots-only loading button and a load that never resolves. The `ProposalsPanel.tsx` action row has not been changed yet.
- **Verification:** Case written from the creator's screenshot and the current source. The live editor tab did not respond, so no width was measured and no reviewer trial was run.
- **Fix (same day):** The action row is `flex-nowrap` again. As it narrows it drops key hints below 24rem, tightens padding and gaps below 22rem, and drops the Original, Apply and Reject icons below 20rem. Words always stay. While loading, Preview/Replay shows `LoadingDots` (now taking a `className`; `font-sans` here so they fit the 14px icon cell) in place of its icon, beside its word. The batch bar's Preview does the same. Another session regrouped the row into Preview·Original and Reject·Apply while this fix was in progress; both groups keep one line. Measured in headless Chrome on a real pending card at 480, 381, 340, 300 and 260px, idle, loading and previewing: every button shares one top, the row never overflows, and every word is visible. The preview was still loading at 381px and below after about 30s. The never-resolves criterion is unverified here, because that belongs to the preview pipeline. A fresh visual-only reviewer then found the loading Replay looked disabled. The panel rule `.proposal-panel button:disabled { opacity: 0.65 }` dimmed it. That rule now skips `aria-busy` buttons, so loading keeps full strength and still can't be clicked. The reviewer also noted that below 20rem the text-only Original, Apply and Reject sit next to a Replay that keeps its icon. Follow-up: below 20rem Replay drops its icon too, so the narrow row is consistently text-only; there the word pulses while loading (no pulse with reduced motion). In the real editor at a 321px row, preview became ready about 1.3s after clicking Preview, with one 1s reload; every button stayed on one line at full strength. The 30s+ loads seen earlier were headless Chrome without a GPU.
- **Follow-up (same day):** The creator added curve points and could not remove them. Delete and Backspace only worked when a point had keyboard focus, and clicking, dragging or adding a point never gave it focus. Neither my own check nor the reviewer tried removing a point. The audit now requires acting like a person with every new control: add then remove, select by click, drag and Tab, Escape, Undo, and a narrow panel. The reviewer brief names removal too. CurveGraph now takes focus when a point is picked, Delete/Backspace remove the selected point, and a visible "Remove point" button sits beside its numbers. A contract test guards all three.
- **Follow-up (same day):** The creator found the proposal card wasteful of vertical space: the "Edit" chip had its own row, the clip name was repeated as a header, the wheel readout had its own row, and the direction words added height. Added the vertical density case (references/vertical-density-audit.md) with before/after measurements and a contract test. Card top to first dial went from about 180px to 128px, and each wheel box from about 330px to 250px. Not yet re-checked by a fresh reviewer.

## 2026-10-23 — Review action row: keys stay, words give way

- **Observation:** Another session reworked the action row so the key hints and icons always show, and the words drop when the row is short of room: secondary words first, Apply's last. This reverses the earlier "words always" rule. The creator chose the keys-always version.
- **Decision:** Rewrote the `review-action-row-v1` rubric. Icons and key hints never drop. Words drop in order and never mid-word, a hidden word stays in the tooltip and accessible name, and the row still never wraps. Loading replaces only the icon and is never dimmed. Removed the narrow-width pulse on the loading word, which only made sense while icons dropped.
- **Verification:** Rubric matched against the current `ProposalsPanel.tsx` constants. No new browser measurement or reviewer trial of the keys-always row.

## 2026-10-24 — Tabs that read as headings

- **Observation:** The creator found the Properties section tabs (Layout, Color, Mask, Effects, Animation, Timing) blended in and did not look clickable or like part of one control. `InspectorPanelTabs` drew unselected tabs as bare text on the panel and wrapped 4 + 2, bypassing `SegmentedControl`, the documented owner for tab groups. Earlier audits checked the selected state only.
- **Decision:** Added the control affordance case (references/control-affordance-audit.md) to every UX audit. `InspectorPanelTabs` now renders one `SegmentedControl` track with equal cells (up to four in a row, otherwise two even rows) and the raised selected segment; the contract test asserts the track.
- **Verification:** Seen in the editor at the docked width (dark theme) before and after; `check:editor-ui`, typecheck. No fresh-eyes reviewer trial and no light-theme check yet.

## 2026-10-24 — Effects panel: show what each effect is and whether it is on

- **Observation:** In Properties → Effects the creator could not tell what Film Look, Glitch or Color Map do, or which were on: those tiles had no picture, and "Applied" was the same grey text as "Add effect", with a ✓ only on the open tile. A "3 applied" caption restated the tiles.
- **Change:** every tile now carries a recorded preview that plays on hover (the looks are recorded on the public-domain sample photos by `scripts/record-look-previews.ts`, listed in `inspector-samples.ts`), a green check and "On" (`--proposal-positive`) when the clip has it or "+ Add" when not, and an outline on the tile open below. Grid matte, subject window and other applied treatments use the same tile. The count caption is gone. A contract test guards previews, states and the caption's removal.
- **Verification:** seen in the editor (light theme) on a clip with all three looks and on one with none; hovering plays the preview. A fresh visual-only reviewer read On/Add and the open tile correctly, but found the 48px thumbnails too small to show the effect (Glitch read as a plain photo), uneven tile widths and low-contrast grey "Add". Fixed: the preview is now a full-width 4:3 picture on top of each tile in an even grid, and "Add" uses the secondary ink. Dark theme not re-checked; the reviewer was not re-run on the final layout.

## 2026-10-25 — Reassurance filler is a wording anti-pattern

- **Observation:** The creator found landing-page copy tacking on "The editor stays free", "You'll go straight to the install steps" and "A free account takes a minute" after headings and buttons that already said it, and called it excessive.
- **Decision:** "Write for non-technical creators" now names reassurance filler (repeated promises, narrating the next step, effort claims) as wording to cut in every audit. The site keeps the same rule with examples in `dreamcut-cloud/site/docs/writing.md`.
- **Verification:** Wording rule only; no editor UI changed.

## 2026-10-26 — Template cards are catalog tiles

- **Observation:** The owner found Templates cards far too large, even in the two-column view, and wanted the creator's own templates separated from the shipped ones like the Library's sources.
- **Decision:** `TemplateCatalog` renders `CatalogTile` (Captions → Looks' size, a Details action) in every placement, with All · Yours · Catalog `FilterButtons` instead of "Your / Shared" section headings; the one-to-four column controls are gone. The catalog card audit case now fails a card larger than that tile instead of a uniform picture well.
- **Verification:** Properties → Templates, Library page Templates tab, Templates page, home Looks row and Storyboard's Add an effect picker checked on the dev build at 328px and wide panels; `check:editor-ui`, typecheck and effects tests pass.

## 2026-10-26 — Tile actions share the name row

- **Observation:** Choosing a look for a music video, the creator found the Templates → Looks Details button sitting on the card's picture and asked for it in line with the name.
- **Change:** `CatalogTile` (the one owner for template, caption-look, text, font and layout tiles) now lays the caption out as a two-column row: the name on the left, the action (Add, Apply or Details) at its right end, centred on the name's first line, below the picture. Names wrap to a second line instead of being cut off. The action keeps its word at every width: an info-icon form for narrow tiles was tried and dropped after the fresh-eyes reviewer found the control changing with panel width confusing.
- **Verification:** On the dev build, Templates → Looks at 136px, 160px and 171px tiles: every one of 87 names whole, no action over the picture or the name, action on the name's first line. Selection does not move the name; Details opens the right look; Back keeps the selection and returns focus to Details. Captions → Looks, Text and Layouts measured the same way. `check:editor-ui` and typecheck pass. Light theme not checked.
