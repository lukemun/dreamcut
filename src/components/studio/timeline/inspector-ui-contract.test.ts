import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { proposalTunableField } from "@/lib/agent/proposal-controls";
import { sharedFontCssVariables } from "@/lib/fonts/registry";

const timelineDir = path.dirname(fileURLToPath(import.meta.url));
const propertyControl = fs.readFileSync(path.join(timelineDir, "InspectorPropertyControl.tsx"), "utf8");
const mediaDrawer = fs.readFileSync(path.join(timelineDir, "MediaDrawer.tsx"), "utf8");
const elementMenu = fs.readFileSync(path.join(timelineDir, "ElementMenu.tsx"), "utf8");
const advancedGrade = fs.readFileSync(path.join(timelineDir, "ColorGradeAdvancedControls.tsx"), "utf8");
const numericControls = fs.readFileSync(path.join(timelineDir, "InspectorNumericControls.tsx"), "utf8");
const captionMenu = fs.readFileSync(path.join(timelineDir, "CaptionMenu.tsx"), "utf8");
const clipTrimRange = fs.readFileSync(path.join(timelineDir, "ClipTrimRangeControl.tsx"), "utf8");
const timelineScene = fs.readFileSync(path.join(timelineDir, "draw-timeline-scene.ts"), "utf8");
const timelineStep = fs.readFileSync(path.resolve(timelineDir, "../TimelineStep.tsx"), "utf8");
const mediaWorkspaceTabs = fs.readFileSync(path.join(timelineDir, "MediaWorkspaceTabs.tsx"), "utf8");
const slider = fs.readFileSync(path.resolve(timelineDir, "../../ui/slider.tsx"), "utf8");
const visualFramingEditor = fs.readFileSync(path.join(timelineDir, "VisualFramingEditor.tsx"), "utf8");
const timelineToolbar = fs.readFileSync(path.join(timelineDir, "TimelineToolbar.tsx"), "utf8");
const assetShelf = fs.readFileSync(path.join(timelineDir, "AssetShelf.tsx"), "utf8");
const slideOutDrawer = fs.readFileSync(path.join(timelineDir, "SlideOutDrawer.tsx"), "utf8");
const projectVersionHeader = fs.readFileSync(path.resolve(timelineDir, "../../../app/p/[projectId]/ProjectVersionHeader.tsx"), "utf8");
const timelinePlaybackShell = fs.readFileSync(path.join(timelineDir, "TimelinePlaybackShell.tsx"), "utf8");
const landscapeRightPanel = fs.readFileSync(path.join(timelineDir, "LandscapeRightPanel.tsx"), "utf8");
const selectedClipActions = fs.readFileSync(path.join(timelineDir, "SelectedClipActions.tsx"), "utf8");
const proposalsPanel = fs.readFileSync(path.join(timelineDir, "ProposalsPanel.tsx"), "utf8");
const proposalAdjustments = fs.readFileSync(path.join(timelineDir, "ProposalAdjustments.tsx"), "utf8");
const timelineClient = fs.readFileSync(path.join(timelineDir, "timeline-client.ts"), "utf8");
const transitionMenu = fs.readFileSync(path.join(timelineDir, "TransitionMenu.tsx"), "utf8");
const inspectorPanel = fs.readFileSync(path.join(timelineDir, "TimelineInspectorPanel.tsx"), "utf8");
const timelineInspector = fs.readFileSync(path.join(timelineDir, "useTimelineInspector.ts"), "utf8");
const inspectorPanelTabs = fs.readFileSync(path.join(timelineDir, "InspectorPanelTabs.tsx"), "utf8");
const keyframeInspector = fs.readFileSync(path.join(timelineDir, "KeyframeInspector.tsx"), "utf8");
const perspectiveReveal = fs.readFileSync(path.resolve(timelineDir, "../../../lib/remotion/PerspectiveTitleReveal.tsx"), "utf8");
const timelineComposition = fs.readFileSync(path.resolve(timelineDir, "../../../lib/remotion/TimelineComposition.tsx"), "utf8");
const globalsCss = fs.readFileSync(path.resolve(timelineDir, "../../../app/globals.css"), "utf8");
const editorGlassCss = fs.readFileSync(path.resolve(timelineDir, "../../../app/editor-glass.css"), "utf8");
const timelineLayout = fs.readFileSync(path.resolve(timelineDir, "../../../app/layout.tsx"), "utf8");
const timelineFonts = fs.readFileSync(path.resolve(timelineDir, "../../../lib/fonts/next-fonts.ts"), "utf8");
const timelineInteractions = fs.readFileSync(path.join(timelineDir, "use-canvas-timeline-interactions.ts"), "utf8");
const timelineContextMenu = fs.readFileSync(path.join(timelineDir, "TimelineContextMenu.tsx"), "utf8");
const clientPeaks = fs.readFileSync(path.join(timelineDir, "computeClientPeaks.ts"), "utf8");
const timelinePayload = fs.readFileSync(path.resolve(timelineDir, "../../../lib/local-store/timeline-payload.ts"), "utf8");
const inspectorStandard = fs.readFileSync(path.resolve(timelineDir, "../../../../docs/standards/inspector-information-architecture.md"), "utf8");
const editorAppearance = fs.readFileSync(path.resolve(timelineDir, "../../../app/EditorAppearance.tsx"), "utf8");
const beatAnnotations = fs.readFileSync(path.join(timelineDir, "useBeatAnnotations.tsx"), "utf8");
const rhythmInspector = fs.readFileSync(path.join(timelineDir, "LibraryRhythmInspector.tsx"), "utf8");
const projectReviewDock = fs.readFileSync(path.resolve(timelineDir, "../../desktop/ProjectReviewDock.tsx"), "utf8");
const previewControls = fs.readFileSync(path.resolve(timelineDir, "../../../lib/frame-runtime/preview-controls.tsx"), "utf8");
const framePlayer = fs.readFileSync(path.resolve(timelineDir, "../../../lib/frame-runtime/player.tsx"), "utf8");
const workspaceResize = fs.readFileSync(path.resolve(timelineDir, "../../ui/workspace-resize.tsx"), "utf8");
const editorWorkspaceCss = fs.readFileSync(path.resolve(timelineDir, "../../../app/editor-workspace.css"), "utf8");

test("compact workbench keeps property rows and icon actions without changing edit handlers", () => {
  assert.ok(elementMenu.includes('className="inspector-property-row'));
  assert.ok(numericControls.includes("data-inspector-number"));
  assert.ok(numericControls.includes("data-inspector-slider"));
  assert.ok(globalsCss.includes("grid-template-columns: 88px minmax(0, 1fr)"));
  assert.ok(globalsCss.includes("@container (max-width: 419px)"));
  // The tab row is a contained SegmentedControl track with a raised selected tab, never loose
  // text that reads as headings (2026-10-13 filled pill; 2026-10-24 track).
  assert.ok(inspectorPanelTabs.includes("<SegmentedControl"));
  assert.ok(!inspectorPanelTabs.includes("background: active ?"));
  assert.ok(inspectorPanelTabs.includes("onKeyDown={(event) => moveFocus(event, index)}"));
  for (const icon of ["ScissorsIcon", "CopyIcon", "Trash2Icon"]) {
    assert.ok(selectedClipActions.includes(`<${icon}`));
  }
});

test("the Properties information architecture is documented as a shared standard", () => {
  for (const rule of [
    "What qualifies as a tab",
    "Canonical domains and order",
    "Timing is not “Clip”",
    "full-duration keyframe strip above the domain tabs",
    "shared collapsible header",
    "Row anatomy and alignment",
    "Selection persistence",
  ]) {
    assert.ok(inspectorStandard.includes(rule), `${rule} is missing from the Inspector standard`);
  }
});

test("media tabs omit unsupported domains and link to a separate transition join", () => {
  assert.ok(elementMenu.includes('.filter((panel) => !("disabled" in panel && panel.disabled))'));
  assert.ok(!elementMenu.includes('Edit transition…'));
  assert.ok(elementMenu.includes('activeVerticalSubpanel === "motion" && transitionContent'));
  assert.ok(elementMenu.includes('aria-label="Transition at next join"'));
  assert.ok(inspectorPanel.includes("props.onOpenTransitionJoin?."));
  assert.ok(!inspectorPanel.includes("Transitions connect two clips at their join."));
  assert.ok(timelineStep.includes("const inspectorTransition = selectedTransition;"));
  assert.ok(elementMenu.includes('runtime_source_has_audio === false'));
  assert.ok(inspectorPanel.includes('(props.layout !== "vertical" || !selectedElement)'));
  assert.ok(inspectorPanel.includes('transitionContent={selectedElement.type === "still" || selectedElement.type === "video_clip"'));
});

test("Properties exposes a full-duration grouped keyframe editor above its tabs", () => {
  assert.ok(inspectorPanel.indexOf("<KeyframeStrip") < inspectorPanel.indexOf("<InspectorPanelTabs"));
  assert.ok(!inspectorPanel.includes('Back to Properties'));
  assert.ok(inspectorPanel.includes("retimeKeyframeMoment"));
  assert.ok(inspectorPanel.includes("keyframeElement.timeline_start + timeSeconds"));
  assert.ok(keyframeInspector.includes('aria-label="Clip keyframes"'));
  assert.ok(keyframeInspector.includes('cursor: "ew-resize"'));
  assert.ok(keyframeInspector.includes('aria-label="Selected keyframe values"'));
  assert.ok(inspectorPanel.includes("hasElementAutomationMoments(keyframeElement)"));
  assert.ok(keyframeInspector.includes("collectElementAutomationTimes(element)"));
  assert.ok(keyframeInspector.includes("volume_envelope: \"Volume\""));
  assert.ok(inspectorPanel.includes("showElement && selectedElement && keyframeElement && props.showKeyframes !== false"));
  assert.ok(!keyframeInspector.includes("No keyframes on this clip"));
  assert.ok(keyframeInspector.includes("<Slider"));
  assert.ok(keyframeInspector.includes("data-keyframe-input={field}"));
  assert.ok(keyframeInspector.includes("interpolation"));
  assert.ok(keyframeInspector.includes("Delete keyframe"));
  assert.ok(keyframeInspector.includes("In + out"));
  assert.ok(keyframeInspector.includes("onDeleteField"));
  assert.ok(keyframeInspector.includes("onDeleteMoment"));
  assert.ok(elementMenu.includes("updateKeyframeAtTime"));
  assert.ok(inspectorPanel.includes("removeKeyframesAtTime"));
});

test("color Inspector pairs accessible sliders with exact-value controls", () => {
  assert.ok(elementMenu.includes("<Slider"));
  assert.ok(elementMenu.includes("<ScrubNumberInput"));
  assert.ok(slider.includes("SliderPrimitive.Root"));
  assert.ok(slider.includes("onValueChange={onValueChange}"));
  assert.ok(slider.includes("onValueCommitted={onValueCommit}"));
  assert.ok(slider.includes("aria-label={label}"));
});

test("Audio and Keyframe volume share dB conversion and large slider targets", () => {
  assert.ok(!elementMenu.includes("How the volume fader works"));
  assert.ok(!elementMenu.includes("volumeHelp"));
  assert.ok(!keyframeInspector.includes("volume_envelope: percentControl"));
  assert.ok(keyframeInspector.includes("gainToFaderDb(gain) ?? FADER_MIN_DB"));
  assert.ok(keyframeInspector.includes("fromDisplay: faderDbToGain"));
  assert.ok(elementMenu.includes("gainToFaderDb(volumeGain)"));
  assert.ok(elementMenu.includes("faderDbToGain(db)"));
  assert.ok(keyframeInspector.includes("largeTarget={field === VOLUME_ENVELOPE_FIELD}"));
  assert.ok(numericControls.includes('largeTarget = label === "volume"') && numericControls.includes('largeTarget={largeTarget}'));
  assert.ok(slider.includes("minHeight: 32"));
});

test("audio effects keep first-class controls compact with self-explaining labels and no help icon", () => {
  assert.ok(!elementMenu.includes("Advanced audio"));
  assert.ok(!elementMenu.includes("AudioEffectGuidance"));
  assert.ok(!elementMenu.includes("audioEffectsHelp"));
  for (const option of [
    "Enhance voice",
    "Use enhanced",
    "Use original",
    "Remove treatment",
    "Detach audio",
  ]) {
    assert.ok(elementMenu.includes(option), `${option} control label is missing`);
  }
});

test("on-timeline proposal auditions expose every basic color-grade control", () => {
  for (const field of [
    "grade_exposure_ev",
    "grade_contrast",
    "grade_saturation",
    "grade_temperature",
    "grade_tint",
    "grade_hue_degrees",
  ]) {
    const control = proposalTunableField("props", field);
    assert.ok(control, `${field} proposal control is missing`);
    assert.ok(control.min < control.max && control.step > 0);
  }
  assert.ok(proposalsPanel.includes("<ProposalAdjustments"));
  assert.ok(proposalAdjustments.includes("spec.toDisplay?.(value) ?? value"));
  assert.ok(proposalAdjustments.includes("spec.fromDisplay?.(bounded) ?? bounded"));
});

test("camera blur proposal auditions expose the same bounded controls as the Inspector", () => {
  for (const field of ["cameraRevealShutterAngle", "cameraRevealBlurSamples"]) {
    assert.ok(proposalTunableField("props", field), `${field} proposal control is missing`);
    assert.ok(captionMenu.includes(field), `${field} Inspector control is missing`);
  }
});

test("proposal choice copy distinguishes independent previews from mutually exclusive approval", () => {
  // The card label and action name the exclusivity; no help popover explains it.
  assert.ok(proposalsPanel.includes('`Choose one · ${optionCount} options`'));
  assert.ok(proposalsPanel.includes('`${isChoice ? "Choose and apply" : "Apply"}${applyKey ? keyInTitle(shortcuts.apply) : ""}`'));
  assert.ok(!proposalsPanel.includes("HelpTooltip"));
  assert.ok(!proposalsPanel.includes('"Apply this option"'));
});

test("multi-option proposals are multiple-choice cards in the shared proposal inbox", () => {
  assert.ok(proposalsPanel.includes('`Choose one · ${optionCount} options`'));
  assert.ok(!proposalsPanel.includes("Previewing does not change your edit"));
  assert.ok(!proposalsPanel.includes("Revised · Previous drafts"));
  assert.ok(!proposalsPanel.includes("{option.summary}"));
  assert.ok(proposalsPanel.includes("{option.label}"));
  assert.ok(!proposalsPanel.includes("Nothing is applied."));
  assert.ok(proposalsPanel.includes("{!embedded && ("));
  // Proposals has no help icon in either header; its cards explain themselves.
  assert.ok(!proposalsPanel.includes("ProposalReviewHelp"));
  assert.ok(!timelineStep.includes("ProposalReviewHelp"));
  assert.ok(!timelineStep.includes("reviewActionsTarget"));
  // The project dock owns the Chat/Proposals tabs; proposals and take comparisons share one panel.
  assert.ok(projectReviewDock.includes('id="project-dock-panel-proposals" role="tabpanel" aria-labelledby="project-dock-tab-proposals" hidden={tab !== "proposals"}'));
  assert.ok(!timelineStep.includes('review-panel-auditions'));
  assert.ok(timelineStep.includes("pendingProposalCount + takeAuditionCount"));
  assert.ok(projectReviewDock.includes('<SegmentedControl size="sm" fill className="project-review-tabs" role="tablist" aria-label="Chat and Proposals">'));
  // Every right-hand drawer header names itself (2026-10-12): close, then the title or tabs.
  assert.ok(timelineStep.includes('<DrawerHeader closeLabel="Close proposals" onClose={closeReviewDrawer}><h2 className="text-sm font-semibold">Proposals</h2></DrawerHeader>'));
  assert.ok(!timelineStep.includes('<span aria-hidden="true" style={{ width: 8, height: 8'));
  assert.ok(!timelineToolbar.includes("onClick={onOpenAuditions}"));
  assert.ok(!timelineStep.includes("Agent proposals\n"));
});

test("embedded proposal review has no help header slot and retries failed details inline", () => {
  assert.ok(!projectReviewDock.includes("reviewActionsTarget"));
  assert.ok(!projectReviewDock.includes("project-review-header-actions"));
  // The header Refresh button was replaced by reopening Proposals and an inline Retry on failed details.
  assert.ok(!timelineStep.includes('aria-label="Refresh review"'));
  assert.ok(proposalsPanel.includes("Reopen Proposals to try again."));
  assert.ok(proposalsPanel.includes('onClick={() => void refresh()}>Retry</Button>'));
  assert.ok(timelineStep.includes("refreshToken={proposalRefreshToken}"));
  assert.ok(proposalsPanel.includes("refreshToken?: number"));
});

test("agent review drawer uses an opaque reading surface", () => {
  assert.ok(timelineStep.includes('testId="review-drawer"'));
  assert.ok(slideOutDrawer.includes('data-testid={testId}'));
  assert.ok(slideOutDrawer.includes('background: "var(--chrome-deep)"'));
  assert.ok(slideOutDrawer.includes('backdropFilter: "none"'));
  assert.ok(slideOutDrawer.includes('WebkitBackdropFilter: "none"'));
});

// Toasts are for problems only (2026-10-09); a rejected proposal simply leaves the list.
test("proposal outcomes do not raise success toasts", () => {
  assert.ok(!/toast\.(success|info)\(/.test(proposalsPanel));
});

test("stale pending proposals remain visible with guarded review actions", () => {
  assert.ok(proposalsPanel.includes("pendingProposalInbox(inboxResponse.proposals)"));
  assert.ok(proposalsPanel.includes("setEntries(inbox.entries)"));
  assert.ok(proposalsPanel.includes("proposalQueue(entries ?? [], historyEntries, openedSteps, closedSteps)"));
  // A stale card says why and offers Repair; it is never a dead end.
  assert.ok(proposalsPanel.includes("<strong>No longer applies.</strong>"));
  assert.ok(proposalsPanel.includes('<ProposalAgentAsk kind="repair"'));
  assert.ok(proposalsPanel.includes('<ProposalAgentAsk kind="draft"'));
  assert.ok(proposalsPanel.includes("!isStale && <ProposalAdvancedAdjustments>"));
  // One Advanced adjustments section per option: timing and graphic dials join it through the shared owner.
  assert.ok(proposalAdjustments.includes("<ProposalAdvancedGroup"));
  assert.ok(!proposalAdjustments.includes("<InspectorDisclosure"));
});

test("batch review keeps selection utilities in a menu and distinct preview/apply actions", () => {
  assert.ok(proposalsPanel.includes('aria-label="Review selection"'));
  assert.ok(proposalsPanel.includes("<Menu.Trigger"));
  assert.ok(proposalsPanel.includes("Preview selected edits"));
  assert.ok(proposalsPanel.includes("Play selected"));
  assert.ok(proposalsPanel.includes("Replay"));
  assert.ok(proposalsPanel.includes("Back to live"));
  // Proposals is its own dock tab now, so the review is active exactly while that tab shows.
  assert.ok(timelineStep.includes('const reviewDrawerOpen = dock ? dock.tab === "proposals" : localReviewOpen;'));
  assert.ok(timelineStep.includes("reviewActive={reviewDrawerOpen}"));
  assert.ok(proposalsPanel.includes("useState<Record<string, string>>({})"));
  assert.ok(!proposalsPanel.includes("selectAllOnActivation"));
  assert.ok(!proposalsPanel.includes("shouldSelectAll || current === null"));
  // Overlap notices were toasts; toasts now report problems only (2026-10-09).
  assert.ok(!proposalsPanel.includes("left pending"));
  assert.ok(!proposalsPanel.includes("Selection only chooses what to review."));
});

test("proposal review has a distinct toolbar entry point instead of masquerading as Library", () => {
  // The waiting count is a pill beside the word, and part of the button's accessible name.
  assert.ok(timelineToolbar.includes('<span className="workspace-panel-count" aria-hidden="true">{pendingProposalCount}</span>'));
  assert.ok(timelineToolbar.includes('`, ${pendingProposalCount} to review`'));
  assert.ok(timelineToolbar.includes('onReviewProposals()'));
  assert.ok(!timelineToolbar.includes('`Library (${pendingProposalCount})`'));
});

test("review consolidates proposals and take comparisons", () => {
  const assetShelf = fs.readFileSync(path.join(timelineDir, "AssetShelf.tsx"), "utf8");
  assert.ok(!assetShelf.includes('key: "audition"'));
  assert.ok(timelineStep.includes("<TakeAuditionReview"));
  // Review renders in the project dock's Proposals tab, with a labelled slide-out fallback outside the dock.
  assert.ok(timelineStep.includes("createPortal(reviewDrawerNode, dock.reviewTarget)"));
  assert.ok(timelineStep.includes('<SlideOutDrawer open={reviewDrawerOpen} label="Proposals" testId="review-drawer"'));
  assert.ok(slideOutDrawer.includes('aria-label={label}'));
  assert.ok(projectReviewDock.includes('hidden={tab !== "proposals"}'));
  assert.ok(!timelineStep.includes('review-panel-auditions'));
  assert.ok(timelineStep.includes("pendingProposalCount + takeAuditionCount"));
  assert.ok(projectReviewDock.includes('role="tablist" aria-label="Chat and Proposals"'));
  assert.ok(!timelineToolbar.includes("onClick={onOpenAuditions}"));
  // Editor quality checks (color continuity review) were retired on 2026-10-09.
  assert.ok(!fs.existsSync(path.join(timelineDir, "ColorContinuityReviewControl.tsx")));
  assert.ok(!timelineStep.includes("colorContinuityReview"));
});

test("Snap and Split are icon buttons sharing the toolbar row height", () => {
  assert.ok(timelineToolbar.includes('<MagnetIcon size={16} strokeWidth={2} />'));
  assert.ok(timelineToolbar.includes('<ScissorsIcon size={16} strokeWidth={2} />'));
  const snapButton = timelineToolbar.slice(
    timelineToolbar.indexOf('onClick={onToggleSnap}'),
    timelineToolbar.indexOf('</Button>', timelineToolbar.indexOf('onClick={onToggleSnap}')),
  );
  const proposalButton = timelineToolbar.slice(
    timelineToolbar.indexOf('onReviewProposals();'),
    timelineToolbar.indexOf('</Button>', timelineToolbar.indexOf('onReviewProposals();')),
  );
  // Icons with tooltips only; no words in the timeline toolbar.
  assert.ok(snapButton.includes("height: 32"));
  assert.ok(snapButton.includes("width: 36"));
  assert.ok(!timelineToolbar.includes('<span>Snap</span>'));
  assert.ok(!timelineToolbar.includes('<span>Split</span>'));
  assert.ok(timelineToolbar.includes('icon={<Rows3Icon size={16} />}'), 'lane height shows its icon in every layout, not a word');
  assert.ok(proposalButton.includes("style={panelButtonStyle}"));
  // Panel buttons take the header height there and keep the toolbar row height elsewhere.
  assert.ok(/const panelButtonStyle = [^;]*height: "var\(--header-control-height, 32px\)"/.test(timelineToolbar));
});

test("timeline edit tools form one icon-only compound control with hover shortcuts", () => {
  assert.ok(timelineToolbar.includes('aria-label="Timeline editing"'));
  // One grouped control without an outline: idle tools are ghost glyphs (open space over lines).
  assert.ok(timelineToolbar.includes('className="timeline-editing-controls flex shrink-0 items-stretch gap-0.5 overflow-hidden rounded-lg"'));
  // Keys come from Settings → Keyboard shortcuts, so the tooltip and aria name follow a changed key.
  for (const shortcut of ['aria-keyshortcuts={ariaKeyShortcut(shortcuts.snap)}', 'aria-keyshortcuts={ariaKeyShortcut(shortcuts.split)}']) {
    assert.ok(timelineToolbar.includes(shortcut));
  }
  // Every toolbar and header tool shows its key on hover; the panel buttons show their names, not key letters.
  assert.equal(timelineToolbar.split("<kbd").length - 1, 0);
  assert.ok(timelineToolbar.includes('withShortcut("Library panel", libraryShortcut)'));
  // Select left/right of the playhead stay keyboard shortcuts ([ and ]) without toolbar buttons.
  assert.ok(!timelineToolbar.includes('aria-label="Select everything left of the playhead"'));
  assert.ok(timelineStep.includes('if (bindingMatches(event, shortcuts.snap))'));
  assert.ok(timelineStep.includes('bindingMatches(event, shortcuts.split) && selectedElement'));
  assert.ok(timelineStep.includes('bindingMatches(event, shortcuts.selectPrevious) && backwardSelectionIds.length > 0'));
  assert.ok(timelineStep.includes('bindingMatches(event, shortcuts.selectNext) && forwardSelectionIds.length > 0'));
});

test("wide landscape keeps Preview and Properties in stable regions with Media on demand", () => {
  assert.ok(!timelinePlaybackShell.includes('aria-label="Media"'));
  assert.ok(timelinePlaybackShell.includes('aria-label="Preview"'));
  // Library and Properties now share one tool region beside the Preview.
  assert.ok(timelinePlaybackShell.includes('<section aria-label="Library and Properties" className="editor-tools">'));
  assert.ok(!timelinePlaybackShell.includes("THREE_PANE_MIN_WIDTH"));
  assert.ok(timelinePlaybackShell.includes('landscapeRightPanelNode?.("inspector")'));
  assert.ok(!timelinePlaybackShell.includes('landscapeRightPanelNode?.("tabs")'));
  assert.ok(landscapeRightPanel.includes('panelMode?: "tabs" | "inspector"'));
  assert.ok(!timelinePlaybackShell.includes('title="Preview"'));
  // One grid serves both layouts, so the shared timeline renderer is mounted exactly once.
  assert.equal(
    timelinePlaybackShell.match(/\{timelineNode\}/g)?.length,
    1,
    "wide and tall layouts must mount the same timeline renderer",
  );
  assert.ok(timelineScene.includes('lane.label.split(" · ", 2)'));
  assert.ok(timelinePayload.includes('new Set(["video_clip", "music", "vo_segment", "vo_full", "sound_effect"])'));
});

test("tall mode keeps the full-height portrait Preview left, Properties · Text · Captions over the Timeline right, and Library in a drawer", () => {
  assert.ok(timelineStep.includes("const shelfAlwaysOpen = false"));
  // Tall mode: Preview spans the left; Properties (with Text and Captions tabs) sits over the Timeline on the right.
  assert.ok(timelinePlaybackShell.includes('editor-playback-workspace--vertical"'));
  assert.ok(timelinePlaybackShell.includes('className="editor-inspector"'));
  assert.ok(editorWorkspaceCss.includes('.editor-playback-workspace--vertical { grid-template-areas:"viewer inspector" "viewer timeline"; }'));
  assert.ok(!timelinePlaybackShell.includes('title="Preview"'));
  assert.ok(mediaDrawer.includes('label="Media drawer"'));
  assert.ok(timelineStep.includes("open={shelfOpen}"));
  assert.ok(timelineStep.includes('workflowPanes: LIBRARY_DRAWER_PANES'));
  // Recipes have their own tab beside Properties; clearing the selection shows them instead of an empty pane.
  assert.ok(timelineStep.includes('["captions", "Captions"], ["recipes", "Templates"]'));
  assert.ok(timelineStep.includes('id="editor-inspector-panel-recipes"'));
  assert.ok(timelineStep.includes('(tab === "properties" ? "recipes" : tab)'));
  assert.ok(mediaWorkspaceTabs.includes('"recipes", "layouts", "captions", "text", "properties"'), "the wide rail keeps its Templates tab, first");
  assert.ok(timelineStep.includes('usePanelSize("dreamcut:tool-rail-width-v2", 52, 52, 108)'), "the rail shows icons only until widened");
  assert.ok(timelineStep.includes('workflowPanes: ["text", "captions"]'));
  assert.ok(timelineStep.includes("drawerMode={true}"));
  // Both layouts use the shared Properties header; Library/Properties switch through the tool rail.
  assert.ok(landscapeRightPanel.includes("<PropertiesSelectionTitle"));
  // Wide keeps the Properties tab in the tool rail; tall shows Properties over the timeline.
  assert.ok(timelineStep.includes('active: !shelfOpen && !layoutsOpen, onSelect: () => openToolPane("properties"), controls: "editor-tool-panel-Properties",'));
  // Layouts is its own rail item after Templates, in the same tool slot, and stays open while clips are picked.
  assert.ok(timelineStep.includes('layouts: { active: layoutsOpen && !shelfOpen, onSelect: () => openToolPane("layouts"), controls: "editor-tool-panel-Layouts" },'));
  assert.ok(mediaWorkspaceTabs.includes('layouts: { label: "Layouts", Icon: LayoutGrid }'));
  assert.ok(timelineStep.includes("inspectorNode={tallWorkspace ? tallInspectorNode : undefined}"));
  assert.ok(timelineStep.includes("setSelectedIds([]);"));
  assert.ok(timelineStep.includes("selectTransition(null);"));
});

test("Proposals slides out away from the preview, and the tool panel folds to its rail", () => {
  // Proposals stays in the header. Its drawer opens on the side away from the preview: from the right over
  // Tall's side column, from the left over Wide's tool column and the timeline below it, never covering the viewer.
  // Every editor drawer (Library, Generate, Proposals) follows the layout itself; none hard-codes a side.
  assert.ok(timelineStep.includes('<SlideOutDrawer open={reviewDrawerOpen} label="Proposals" testId="review-drawer" width={REVIEW_DRAWER_WIDTH} widthStorageKey="dreamcut.review-drawer-width">'));
  assert.ok(slideOutDrawer.includes('side = "auto",') && slideOutDrawer.includes("setAutoSide(editorDrawerSide())"));
  assert.ok(slideOutDrawer.includes('document.querySelector<HTMLElement>(".editor-playback-workspace--horizontal .editor-tools")'));
  // Tall: a drawer opens right up to the video frame. Wide: a left drawer matches the tool column (2026-10-14:
  // reaching the frame made it far too wide beside a tall picture) and its right edge drags; double-click resets.
  assert.ok(slideOutDrawer.includes('[data-composition-master-frame]'));
  assert.ok(slideOutDrawer.includes("setToolColumnRight(tools ? Math.round(tools.getBoundingClientRect().right) : null);"));
  assert.ok(slideOutDrawer.includes("{widthStorageKey && (fromLeft || columnLeft === null) && <div"));
  assert.ok(slideOutDrawer.includes("const grow = fromLeft ? 1 : -1;"));
  // The Library lives only in its drawer (restored 2026-10-13). Two tabs, Library and Generate (in place); Library's
  // sub-tabs are Images · Video · Music · Sounds, sharing search, Import and Your media / Catalog (UX audit 2026-10-13).
  // Wide's tool rail keeps Captions, Text, Templates, Layouts and Properties.
  assert.ok(timelineStep.includes('const LIBRARY_DRAWER_PANES = ["browse", "generate"] as const;'));
  assert.ok(assetShelf.includes('const audioInLibrary = !!workflowPanes?.includes("browse") && !workflowPanes.includes("music")'));
  assert.ok(assetShelf.includes('{audioInLibrary ? LIBRARY_KINDS.map('));
  assert.ok(assetShelf.includes('setLibrarySource("project");'), "an import lands in Your media of its kind");
  assert.ok(timelineStep.includes('const TOOL_PANEL_PANES = ["captions", "text", "recipes"] as const;'));
  assert.ok(timelineStep.includes("{!tallWorkspace && wideLibraryMounted && <MediaDrawer open={wideLibraryOpen}"));
  assert.ok(timelineStep.includes("onOpenMedia={toggleLibraryDrawer}"));
  assert.ok(assetShelf.includes("const generateAsDrawer = !standaloneGeneration && !inlineGenerate"));
  assert.ok(slideOutDrawer.includes('transform: open ? "translateX(0)" : fromLeft ? "translateX(-105%)" : "translateX(105%)"'));
  assert.ok(slideOutDrawer.includes("if (!open || !element || fromLeft) return;"), "a left drawer covers the tools instead of reflowing the editor");
  // Clicking the open rail item folds the panel; the viewer takes the width.
  assert.ok(mediaWorkspaceTabs.includes("if (properties?.onReselect && pane === selected) return properties.onReselect();"));
  assert.ok(timelineStep.includes("collapsed: toolsCollapsed, onReselect: () => setToolsCollapsed(true),"));
  assert.ok(timelinePlaybackShell.includes('toolsCollapsed ? "auto minmax(0,1fr)"'));
  // The workspace opens at the video's shape at any window width (2026-10-25, replacing the
  // 2026-10-13 half-screen Wide default); the Tall/Wide switch never leaves the header.
  assert.ok(timelineStep.includes("const previewAspectRatio = chosenLayout;"));
  assert.ok(!timelineStep.includes("useHalfScreenWorkspace"));
  assert.ok(timelineStep.includes("showEditorLayoutSwitcher={capabilities.editorLayoutSwitcher}"));
});

test("Media and Review share one persistent slide-out drawer primitive", () => {
  assert.ok(mediaDrawer.includes("<SlideOutDrawer"));
  assert.ok(mediaDrawer.includes('widthStorageKey="dreamcut.library-drawer-width"'));
  assert.ok(timelineStep.includes('import { SlideOutDrawer }'));
  assert.ok(timelineStep.includes('<SlideOutDrawer open={reviewDrawerOpen} label="Proposals"'));
  // Wide: Media is a tab of the fixed tool area. Tall: Library slides out as a drawer.
  assert.ok(timelineStep.includes('<MediaDrawer open={shelfOpen} onClose={closeShelf}>{tallLibraryShelfNode}</MediaDrawer>'));
  // Every drawer: Escape closes the top one, focus moves in on open and back to the opener on close.
  assert.ok(slideOutDrawer.includes('if (event.key !== "Escape" || event.defaultPrevented || keepsEscape(event.target)) return;'));
  assert.ok(slideOutDrawer.includes("if (panel.current && drawers.at(-1) !== panel.current) return;"));
  assert.ok(slideOutDrawer.includes("opener.focus({ preventScroll: true })"));
  // Tall covers the whole side column; wide docks so the editor reflows instead of being cut.
  assert.ok(slideOutDrawer.includes('.editor-playback-workspace--vertical .editor-inspector'));
  assert.ok(editorWorkspaceCss.includes("html[data-editor-drawer] .editor-glass-workspace:has(.editor-playback-workspace--horizontal)"));
  assert.ok(timelineStep.includes('<div className="editor-tool-content" hidden={toolsCollapsed || !shelfOpen}>{assetShelfNode}</div>'));
  assert.ok(slideOutDrawer.includes('transform: open ? "translateX(0)" : fromLeft ? "translateX(-105%)" : "translateX(105%)"'));
  assert.ok(slideOutDrawer.includes('pointerEvents: open ? "auto" : "none"'));
  assert.ok(assetShelf.includes("drawerMode = false"));
});

test("Media combines close, type tabs, and import above search without approval filtering", () => {
  assert.ok(assetShelf.includes('label: "Images"'));
  assert.ok(assetShelf.includes('label: "Video"'));
  assert.ok(assetShelf.includes('label: "Audio"'));
  assert.ok(!assetShelf.includes('label: "Visuals"'));
  assert.ok(!assetShelf.includes('label: "Captions"'));
  assert.ok(assetShelf.includes('const AUDIO_TABS'));
  assert.ok(!assetShelf.includes('{ key: "voice", label: "Voice" }'));
  assert.ok(assetShelf.includes('data-audio-row=""'));
  assert.ok(assetShelf.includes('flex min-h-12 min-w-0'), 'music rows grow so titles and licence status are not cut off');
  assert.ok(assetShelf.includes('data-media-details-panel=""'));
  assert.ok(assetShelf.includes('{renderMusicTracks(true)}'));
  assert.ok(assetShelf.includes('expandedAudioId !== track.track_id || !track.catalog_track_id'));
  assert.ok(assetShelf.includes('grid-cols-[72px_minmax(0,1fr)]'));
  assert.ok(assetShelf.includes('Usage & technical details</summary>'));
  assert.ok(assetShelf.includes('aria-label="Browse media types"'));
  assert.ok(assetShelf.includes('<DrawerCloseButton label="Close Library drawer"'));
  assert.ok(assetShelf.includes('<UploadIcon size={18} />'));
  assert.ok(assetShelf.includes('aria-label={uploadingTab != null ? "Importing media" : "Import media"}'));
  // The header import stays outside the editor; in the editor Import sits on the search row, named for the kind it adds.
  assert.ok(assetShelf.includes('{!propertiesTab && !editorRail && (<button'));
  assert.ok(assetShelf.includes('aria-label={uploadingTab != null ? "Importing…" : `Import ${libraryKind?.noun ?? "media"}`}'));
  assert.ok(assetShelf.includes('? <>{renderMusicTracks()}{renderSfx()}</>'));
  // In the editor rail, Music and Sounds are their own tabs; Library keeps Images, Video and finished Exports.
  assert.ok(assetShelf.includes('section.key === "stills" || section.key === "videos" || section.key === "exports" || (section.key === "audio" && !editorRail)'));
  assert.ok(assetShelf.includes('{ key: "exports", label: "Exports", noun: "exports" }'));
  assert.ok(assetShelf.includes('<CaptionLookGallery target={captionLookTarget ?? textTarget} onApplyLaneStyle={onApplyCaptionLaneStyle} onAddElement={onAddElement} />'));
  assert.ok(!assetShelf.includes("approvedOnly"));
  assert.ok(!assetShelf.includes('>Approved</button>'));
});

test("caption construction has its own tool and stays outside selected-item Properties", () => {
  const vertical = elementMenu.slice(elementMenu.indexOf('if (isVertical)'));
  assert.ok(!vertical.includes('sectionId="captions"'));
  // Captions opens on Transcript (speech words, word count, pauses); Looks holds the appearance catalog.
  assert.ok(assetShelf.includes('{captionGeneration}\n      {captionTranscript && captionView === "transcript" ? captionTranscript : <>'));
  assert.ok(assetShelf.includes('if (pane === "captions") selectTab("captions")'));
  assert.ok(timelineStep.includes('captionGeneration={<GenerateCaptionsControl'));
});

test("Properties uses a compact collapse control without obscuring the selected name", () => {
  assert.ok(landscapeRightPanel.includes("onCloseProperties: () => void"));
  assert.ok(landscapeRightPanel.includes('aria-label="Collapse Properties"'));
  assert.ok(landscapeRightPanel.includes("ChevronsDownIcon"));
  assert.ok(!landscapeRightPanel.includes('width: "min(180px, 34%)"'));
  assert.ok(!timelineStep.includes('width: "min(180px, 34%)"'));
  assert.ok(landscapeRightPanel.includes('setActiveTab("library")'));
  assert.ok(landscapeRightPanel.includes("else onCloseProperties();"));
  assert.ok(timelineStep.includes("onCloseProperties={() => setShelfOpen(true)}"));
});

test("proposal playback uses the same icon language as the main transport", () => {
  assert.ok(proposalsPanel.includes('<PlayIcon aria-hidden="true"') && !proposalsPanel.includes('RotateCcwIcon'));
  assert.ok(!proposalsPanel.includes("▶ Play"));
  // The main transport now lives in the shared preview controls.
  assert.ok(previewControls.includes('{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}'));
});

test("proposal choices use number keys to check options and R to play the checked selection", () => {
  assert.ok(proposalsPanel.includes("const reviewOptions = useMemo"));
  assert.ok(proposalsPanel.includes("const keyboardOptions = useMemo"));
  assert.ok(proposalsPanel.includes("reviewOptions.slice(0, 9)"));
  assert.ok(proposalsPanel.includes('if (reviewActive && busy == null && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey)'));
  assert.ok(proposalsPanel.includes("toggleProposalSelection(entries ?? [], details, selectedOptions, selection.proposalId, selection.option.option_id)"));
  // Ticking a choose-one option (checkbox or number key) shows it in place, without replaying.
  assert.ok(proposalsPanel.includes("if (!(adding && showTickedChoice(next, selection.proposalId))) beforeTickChange(adding);"));
  assert.ok(proposalsPanel.includes("if (!showTickedChoice(next, entry.proposal_id)) beforeTickChange(true);"));
  assert.ok(proposalsPanel.includes("onTuneOption({ proposalId, optionId: option.option_id, optionLabel: option.label, overrides: overridesFor(proposalId, option) });"));
  assert.ok(proposalsPanel.includes('aria-keyshortcuts={keyboardShortcut ?? undefined}'));
  assert.ok(proposalsPanel.includes('!bindingMatches(event, shortcuts.reviewPlay) || !reviewActive || busy != null'));
  assert.ok(proposalsPanel.includes('if (selectedBatch.length === 0) return;'));
  // R on a ticked card replays the set from that card's change, like the card's own Replay.
  assert.ok(proposalsPanel.includes("playSelected(keyTargetTicked ? details[keyTarget.proposalId]?.review.find((option) => option.option_id === keyTarget.optionId) : undefined);"));
  assert.ok(proposalsPanel.includes("else if (selections.length > 1) onPlayBatch(selections, focus);"));
  // A preview of the ticked edits follows the ticks instead of ending when one is unticked.
  assert.ok(proposalsPanel.includes("if (!activePreview) return;"));
  assert.ok(proposalsPanel.includes("if (adding) followSelection.current = true;"));
  assert.ok(proposalsPanel.includes("else if (!followSelection.current) onExitPreview();"));
  assert.ok(proposalsPanel.includes("playSelection(selectedBatch);"));
  assert.ok(!proposalsPanel.includes("if (!reviewActive) return;"));
  // Preview, Replay and R play without ticking anything: a card the creator unticked stays unticked.
  const playOption = proposalsPanel.slice(proposalsPanel.indexOf("const playKeyboardOption = useCallback"), proposalsPanel.indexOf("}, [onPlayOptions, overridesFor]);"));
  assert.ok(playOption.length > 0 && !playOption.includes("checkKeyboardOption") && !playOption.includes("setSelectedOptions"));
  // Key hints show on every card's buttons; the shortcut is announced only on the buttons the key presses.
  assert.ok(proposalsPanel.includes('aria-keyshortcuts={replaysThis ? ariaKeyShortcut(shortcuts.reviewPlay) : undefined}'));
  assert.ok(proposalsPanel.includes('aria-keyshortcuts={replayCard ? undefined : ariaKeyShortcut(shortcuts.reviewPlay)}'));
  assert.ok(!/\? <span className=\{REVIEW_KEY_HINT\}><Keycap>/.test(proposalsPanel));
  assert.ok(!proposalsPanel.includes("ProposalReviewHelp"));
});

test("A applies one edit: the previewed card, else the only checked one; never a batch", () => {
  // A creator who presses A on one card must not also apply every other checked card.
  assert.ok(proposalsPanel.includes('bindingMatches(event, shortcuts.apply) && reviewActive && busy == null'));
  assert.ok(proposalsPanel.includes("if (activePreview && !activePreview.batch?.length) return { proposalId: activePreview.proposalId, optionId: activePreview.optionId };"));
  // Several open cards: the keys go to the topmost selected one, never to all of them.
  assert.ok(proposalsPanel.includes("if (selectedHere.length >= 1) return selectedHere[0]!;"));
  // A wave's unopened steps never take the keys from the open step.
  assert.ok(proposalsPanel.includes("const visible = new Set(actionableEntries.map((entry) => entry.proposal_id));"));
  assert.ok(proposalsPanel.includes("void approve(match.proposalId, match.option);"));
  assert.ok(!proposalsPanel.includes('aria-keyshortcuts={selectedBatch.length > 1 ? "A" : undefined}'));
  assert.ok(proposalsPanel.includes('aria-keyshortcuts={applyKey ? ariaKeyShortcut(shortcuts.apply) : undefined}'));
  assert.ok(proposalsPanel.includes('`Apply ${selectedBatch.length}`'));
  // Apply also waits while a motion graphic re-renders after a creator's control change.
  assert.ok(proposalsPanel.includes('disabled={busy != null || isStale || Boolean(motionRendering[`${entry.proposal_id}:${option.option_id}`])}'));
});

test("X rejects only the card the keys act on, and review actions keep their words", () => {
  // Single keys, no Shift: a mistaken decision is undone with Undo (creator direction).
  assert.ok(proposalsPanel.includes('bindingMatches(event, shortcuts.reject) && reviewActive && keyTarget && busy == null'));
  assert.ok(proposalsPanel.includes('details[entry.proposal_id]?.review.some((option) => option.option_id === keyTarget.optionId)'));
  assert.ok(proposalsPanel.includes('void reject(entry.proposal_id)'));
  assert.ok(proposalsPanel.includes('aria-keyshortcuts={applyKey ? ariaKeyShortcut(shortcuts.reject) : undefined}'));
  // The actions share one line. Creator direction (2026-10-23): key hints and icons always show;
  // a narrow card tightens padding, then drops secondary words, and Apply's word last.
  assert.ok(proposalsPanel.includes('const REVIEW_ACTION_WORD = "hidden @[19rem]:inline";'));
  assert.ok(proposalsPanel.includes('const REVIEW_PRIMARY_WORD = "hidden @[16rem]:inline";'));
  assert.ok(proposalsPanel.includes('className="@container mt-3 flex min-w-0 flex-nowrap items-center gap-1.5 @max-[22rem]:gap-1"'));
  assert.ok(!proposalsPanel.includes('className="@container mt-3 flex min-w-0 flex-wrap'));
  assert.ok(proposalsPanel.includes('const REVIEW_ROW_ICON = "shrink-0";'));
  // Key hints always show; words give way first on a narrow card (creator direction).
  assert.ok(proposalsPanel.includes('const REVIEW_KEY_HINT = "inline-flex";'));
  assert.ok(proposalsPanel.includes('aria-pressed={compareShowingLive}'));
  // The batch bar previews or applies every checked edit, so it shows whenever two or more are checked.
  assert.ok(proposalsPanel.includes('{selectedBatch.length > 1 && ('));
  assert.ok(proposalsPanel.includes('REVIEW_APPLY_ACTION'));
});

test("proposal review slides independently while its temporary preview stays mounted", () => {
  assert.ok(timelineStep.includes("const closeReviewDrawer = useCallback(() => {"));
  assert.ok(timelineStep.includes("setReviewDrawerOpen(false);"));
  assert.ok(timelineStep.includes('onClose={closeReviewDrawer}'));
  assert.ok(timelineStep.includes("closeReviewDrawer();"));
  assert.ok(timelineStep.includes('setReviewDrawerOpen((open) => !open);'));
  assert.ok(timelineStep.includes('matchesShortcut(event, shortcuts.proposals)'));
  assert.ok(timelineToolbar.includes('aria-keyshortcuts={proposalsShortcut === "Off" ? undefined : proposalsShortcut}'));
  assert.ok(!timelineToolbar.includes('"Review · Previewing"'));
  assert.ok(timelineToolbar.includes('withShortcut("Temporary proposal preview active", proposalsShortcut)'));
  assert.ok(!timelineStep.includes("keepProposalPreviewOnTimeline"));
  assert.ok(!timelineStep.includes("Temporary preview\n"));
});

test("proposal preview status stays in its option and existing Review control", () => {
  assert.ok(!timelineStep.includes("Playing “${proposalPreviewSelection.optionLabel}”"));
  assert.ok(proposalsPanel.includes('<PlayIcon aria-hidden="true"') && !proposalsPanel.includes('RotateCcwIcon'));
  assert.ok(proposalsPanel.includes('selectedOptions?.[entry.proposal_id] === option.option_id) { playSelected(option); return; }'));
  assert.ok(proposalsPanel.includes('selectionForPlayedOption(entries ?? [], details, current, entry.proposal_id, option.option_id));\n                          playKeyboardOption(entry.proposal_id, option);'));
  assert.ok(proposalsPanel.includes("Back to live"));
  assert.ok(!proposalsPanel.includes('B switches Live / Proposal. R replays the selected side.'));
  assert.ok(proposalsPanel.includes('aria-label={`Show original${keyInTitle(shortcuts.compareOriginal)}`}'));
  assert.ok(proposalsPanel.includes('<Keycap>'));
  const liveButtonStart = proposalsPanel.indexOf('aria-label={`Show original${keyInTitle(shortcuts.compareOriginal)}`}');
  const liveButton = proposalsPanel.slice(liveButtonStart, proposalsPanel.indexOf('</Button>', liveButtonStart));
  assert.ok(liveButton.includes('{keyHint(shortcuts.compareOriginal)}'));
  // Card actions are an icon and its key; the name is the tooltip and accessible label.
  assert.ok(liveButton.includes('title={`Show original${keyInTitle(shortcuts.compareOriginal)}`}') && !liveButton.includes("Before"));
  // A back-arrow reads as "back to the original".
  assert.ok(liveButton.includes('<Undo2Icon aria-hidden="true" className={REVIEW_ROW_ICON} />'));
  assert.ok(proposalsPanel.includes('{optionCount === 1 ? ('));
  assert.ok(proposalsPanel.includes('{optionCount > 1 && <div'));
  assert.ok(!proposalsPanel.includes("Preview only — nothing applied · Hold B to compare"));
});

test("proposal refresh bypasses browser cache so file-backed state cannot look empty or stale", () => {
  assert.ok(timelineClient.includes('new URLSearchParams({ _: String(Date.now()) })'));
  assert.ok(timelineClient.includes('query.set("status", status)'));
  assert.ok(timelineClient.includes('timeline/proposals/${proposalId}?_=${Date.now()}'));
  assert.ok(timelineClient.includes('cache: "no-store"'));
});

test("proposal review discovers agent changes without a manual browser refresh", () => {
  // Polling lives in one shared, visibility-aware conditional feed (behaviour
  // covered in shared-poll.test.ts); the panel and the badge both subscribe.
  const sharedPollSource = fs.readFileSync(path.join(timelineDir, "shared-poll.ts"), "utf8");
  const inboxFeed = fs.readFileSync(path.join(timelineDir, "proposal-inbox-feed.ts"), "utf8");
  assert.ok(inboxFeed.includes("PROPOSAL_INBOX_POLL_INTERVAL_MS = 2_000"));
  assert.ok(proposalsPanel.includes("feed.subscribe(applyInbox)"));
  assert.ok(timelineStep.includes("proposalInboxFeed(proposalsClient).subscribe("));
  assert.ok(sharedPollSource.includes('window.addEventListener("focus", onVisibility)'));
  assert.ok(sharedPollSource.includes('document.addEventListener("visibilitychange", onVisibility)'));
  assert.ok(sharedPollSource.includes("if (inFlight)"));
});

test("proposal summaries remain visible if one detail request fails", () => {
  assert.ok(proposalsPanel.includes("setEntries(inbox.entries)"));
  assert.ok(proposalsPanel.includes("errors[entry.proposal_id]"));
  assert.ok(proposalsPanel.includes("Review details could not be loaded"));
});

test("opening edit proposals expose bounded cut and close-up positioning controls", () => {
  for (const field of [
    "remove_opening_seconds",
    "punch_in_source_seconds",
    "punch_in_scale",
    "punch_in_offset_x",
    "punch_in_offset_y",
  ]) {
    const control = proposalTunableField("opening_sequence_edit", field);
    assert.ok(control && control.min < control.max && control.step > 0, `${field} bounded proposal control is missing`);
  }
  assert.ok(proposalAdjustments.includes("<SliderScrubControl"));
  assert.ok(proposalAdjustments.includes('label={`${label} for ${subject}`}'));
});

test("transform Inspector uses centered position sliders with exact values", () => {
  assert.equal(elementMenu.split(">Preview grid</Button>").length - 1, 2);
  assert.ok(elementMenu.includes('headerAction={<Button variant="ghost" size="sm" aria-pressed={showPositionGrid}'));
  assert.ok(elementMenu.includes("aria-pressed={showPositionGrid}"));
  assert.ok(numericControls.includes("function SliderScrubControl"));
  for (const label of ["scale", "opacity", "horizontal", "vertical"]) {
    assert.ok(elementMenu.includes(`label="${label}"`), `${label} slider is missing`);
  }
  assert.ok(!elementMenu.includes("<PositionGrid"));
  for (const axis of ["X", "Y"]) {
    assert.ok(elementMenu.includes(`value={editMediaOffset${axis}} min={-2} max={2} step={0.01} fallback={0}`));
    assert.ok(elementMenu.includes(`value={String(Number(editMediaOffset${axis}) * 50)} min={-100} max={100} step={0.5} unit="%" fallback={0}`));
  }
  assert.ok(numericControls.includes('label={`${label} value`}'));
  assert.ok(numericControls.includes("const [liveValue, setLiveValue] = useState<number | null>(null)"));
  assert.ok(numericControls.includes("setLiveValue(next)"));
  assert.ok(numericControls.includes("onChange(format(next))"));
  assert.ok(numericControls.includes("onCommit(format(next))"));
});

test("visual framing exposes the playback source, exact result, direct manipulation, and an explicit apply action", () => {
  assert.ok(elementMenu.includes("<VisualFramingEditor"));
  assert.ok(elementMenu.includes('aria-label="Visual framing workspace"'));
  assert.ok(elementMenu.includes("setVisualFramingOpen(true)"));
  assert.ok(visualFramingEditor.includes("Frame in canvas"));
  assert.ok(!visualFramingEditor.includes("Drag the visible frame on the source"));
  assert.ok(visualFramingEditor.includes('aria-label="Drag visible frame"'));
  assert.ok(visualFramingEditor.includes("previewVisualTransform(values)"));
  assert.ok(visualFramingEditor.includes("commitVisualTransformValues(formatDraft(transform))"));
  assert.ok(visualFramingEditor.includes("Apply framing"));
  assert.ok(visualFramingEditor.includes("reframing can’t restore removed pixels"));
});

test("the vertical Position inspector exposes a direct crop and reframe workspace", () => {
  assert.ok(elementMenu.includes('title="Reframe visually"'));
  assert.ok(!elementMenu.includes('Choose the visible part of the source, then apply it to the canvas.'));
  assert.ok(elementMenu.match(/<VisualFramingEditor/g)?.length === 2);
  assert.ok(elementMenu.includes('title="Shape mask"'));
});

test("Style exposes visual mask shapes before feather and precise values", () => {
  const maskSection = elementMenu.slice(elementMenu.indexOf('<InspectorSection sectionId="shape-mask" title="Shape mask">'), elementMenu.indexOf('<InspectorSection sectionId="rhythm"', elementMenu.indexOf('<InspectorSection sectionId="shape-mask"')));
  assert.ok(maskSection.includes('activeVerticalSubpanel === "mask" ? <VisualMaskEditor'));
  assert.ok(!maskSection.includes('activeVerticalSubpanel === "position"'));
  assert.ok(maskSection.indexOf('<VisualMaskEditor') < maskSection.indexOf('>Feather</span>'));
  assert.ok(maskSection.indexOf('<VisualMaskEditor') < maskSection.indexOf('Rectangle edges'));
  assert.ok(maskSection.includes('=== "Rectangle" ? <InspectorDisclosure'));
  const picker = fs.readFileSync(path.join(timelineDir, "VisualMaskEditor.tsx"), "utf8");
  assert.ok(picker.includes('<InspectorVisualChoice label="Shape masks"'));
  assert.ok(picker.includes('value={maskShapeLabel(mask)}'));
  assert.ok(picker.includes('["None", "Rectangle", "Line"]'));
  assert.ok(picker.includes('<SliderScrubControl label="Line mask rotation"'));
  assert.ok(picker.includes('<SliderScrubControl label="Line mask position"'));
  assert.ok(picker.includes('value={String((lineOffset + .5) * 100)}') && picker.includes('onCommit={value => { if (value != null) save(moveMaskEdge('));
  assert.ok(picker.includes('>Invert</Button>'));
  assert.ok(!elementMenu.includes('Preview only · export is unchanged'));
  assert.ok(!elementMenu.includes('<CutoutReviewControl'));
  assert.ok(picker.includes('aria-label="Rotate mask on preview"'));
  assert.ok(picker.includes('aria-label="Reset mask rotation"'));
  assert.ok(!picker.includes('Rotate line right 15 degrees'));
  assert.ok(picker.includes('showRotation(active.latest)'));
  assert.ok(picker.includes('rotate(active.latest)'));
  assert.ok(picker.includes('onPointerCancel={cancel}'));
  assert.ok(!elementMenu.includes('Select presenter cutout at playhead'));
  assert.ok(timelineStep.includes('resolveInspectorTarget(elements, selectedElement, playheadSec, inspectorDomain === "audio" ? "audio" : "picture")'));
  assert.ok(timelineStep.includes('selectedElement: inspectorElement'));
  // Tall and wide layouts share one Properties panel, so the target is passed once.
  assert.equal(timelineStep.match(/selectedElement=\{inspectorElement\}/g)?.length, 1);
  assert.ok(timelineStep.includes('element.id === inspectorElement.id'));
});

test("bounded basic and animation fields expose sliders as well as exact values", () => {
  assert.ok(elementMenu.includes('label="volume"'));
  assert.ok(elementMenu.includes('label={`${side} animation duration`}'));
  assert.ok(elementMenu.includes('label="scale"'));
  assert.ok(elementMenu.includes("min={0.1} max={3}"));
  assert.ok(elementMenu.includes("min={0} max={2}"));
});

test("transition parameters share registered bounds and a labelled numeric control", () => {
  assert.ok(transitionMenu.includes('field="params.whip_blur_strength"'));
  assert.ok(transitionMenu.includes('transitionControl(field)'));
  assert.ok(transitionMenu.includes('label={name}'));
  assert.ok(transitionMenu.includes('max={control.max * scale}'));
});

test("directional transitions expose all directions and visible parameter help", () => {
  assert.ok(transitionMenu.includes("resolveTransitionDirection"));
  for (const value of ["from-left", "from-right", "from-top", "from-bottom"]) {
    assert.ok(transitionMenu.includes(`'${value}':`), `missing direction option ${value}`);
  }
  assert.ok(transitionMenu.includes('Object.entries(directions).map'));
  assert.ok(transitionMenu.includes("transition.type !== 'fade'"));
  assert.ok(transitionMenu.includes('Max {maxDurationSeconds.toFixed(2)} s'));
  assert.ok(!transitionMenu.includes('Share of the total duration held at full strength'));
});

test("image sequences expose audio-synced change timing in the Inspector", () => {
  assert.ok(captionMenu.includes("Sync image changes to audio"));
  assert.ok(captionMenu.includes('aria-label="Image change times (seconds)"'));
  assert.ok(!captionMenu.includes("Empty uses Image hold"));
  assert.ok(captionMenu.includes('label="First change"'));
  assert.ok(captionMenu.includes("Clean cut"));
});

test("transform keyframes are independent with an explicit all-transform action", () => {
  for (const field of ["media_scale", "media_offset_x", "media_offset_y"]) {
    assert.ok(elementMenu.includes(`transformFieldKeyedAtPlayhead.${field}`));
    assert.ok(elementMenu.includes(`toggleTransformKeyframeAtPlayhead("${field}")`));
  }
  assert.ok(elementMenu.includes('fields="media_scale,media_offset_x,media_offset_y"'));
  assert.ok(elementMenu.includes('<InspectorGroupActions\n                label="Frame position"'));
  assert.ok(elementMenu.includes('onToggle={addTransformKeyframeAtPlayhead}'));
});

test("crop Inspector pairs sliders with exact-value controls for every continuous property", () => {
  assert.ok(elementMenu.includes('label={`crop ${field}`}'));
  assert.ok(elementMenu.includes('label={`horizontal band ${field}`}'));
  assert.ok(elementMenu.includes('label="mask softness"'));
  for (const label of ["Top", "Right", "Bottom", "Left", "Center", "Height", "Feather"]) {
    assert.ok(elementMenu.includes(label), `${label} crop control is missing`);
  }
});

test("crop Inspector uses the same compact diamond keyframe button as other effects", () => {
  assert.ok(elementMenu.includes('fields="mask_inset"'));
  assert.ok(elementMenu.includes('label={isAlphaCutout ? "Occlusion edges" : "Crop edges"}'));
  assert.ok(propertyControl.includes('aria-label={`Toggle ${label} keyframe at playhead`}'));
  assert.ok(!elementMenu.includes("function CropKeyframeControl"));
  assert.ok(!elementMenu.includes("Editing keyframe at"));
  assert.ok(!elementMenu.includes("Start animation"));
});

test("every keyframed Inspector submenu uses the shared control-row anatomy", () => {
  assert.ok(propertyControl.includes("function InspectorPropertyControl"));
  assert.ok(!elementMenu.includes("function EffectFieldLabel"));
  assert.ok(elementMenu.includes('className="ml-auto flex items-center gap-1.5"'));
  for (const field of [
    "grade_exposure_ev",
    "grade_contrast",
    "grade_saturation",
    "grade_temperature",
    "grade_tint",
    "grade_hue_degrees",
    "grade_contrast_pivot",
    "lut_intensity",
  ]) {
    assert.ok(elementMenu.includes(field), `${field} shared property control is missing`);
  }
  // Each tone row resets to its own neutral value (Pivot's is not zero).
  assert.ok(elementMenu.includes("onReset={() => commitColorGrade(field, String(Number(colorGradeFieldToDisplay(field, IDENTITY_COLOR_GRADE).toFixed(1))))}"));
  // Wheels, curves and colour slices share one property row per field, with Reset and the keyframe diamond.
  for (const owner of ["fields={field} keyed={keyed[field]}", "<GradeDial field={field}"]) {
    assert.ok(advancedGrade.includes(owner), `advanced grading row ${owner} is missing`);
  }
  for (const control of ["<ColorWheel", "<CurveGraph", "COLOR_GRADE_SLICE_FIELDS.map"]) assert.ok(advancedGrade.includes(control));
  assert.ok(elementMenu.includes("onReset={() => commitIntensity(1)}"));
});

test("focused numeric inputs use their declared keyboard step and a fine-step modifier", () => {
  assert.ok(numericControls.includes("const keyStep = event.shiftKey ? step : keyboardStep"));
  assert.ok(numericControls.includes("fallback + direction * keyStep"));
  assert.ok(numericControls.includes("event.stopPropagation()"));
  assert.ok(numericControls.includes("Arrow Up or Down changes by ${keyboardStepLabel}"));
  assert.ok(numericControls.includes("keyboardStep={step}"));
});

test("numeric Inspector fields expose visible magnitude steppers without repeating the scrub icon", () => {
  assert.ok(numericControls.includes('aria-label={`Increase value by ${stepLabel}`}'));
  assert.ok(numericControls.includes('aria-label={`Decrease value by ${stepLabel}`}'));
  assert.ok(numericControls.includes('aria-label="One-step controls"'));
  assert.ok(numericControls.includes("onClick={() => nudge(1)}"));
  assert.ok(numericControls.includes("onClick={() => nudge(-1)}"));
  assert.ok(elementMenu.includes("<PlusIcon"));
  assert.ok(elementMenu.includes("<MinusIcon"));
  assert.ok(elementMenu.includes('aria-label={`Increase speed by ${step}`}'));
  assert.ok(elementMenu.includes('aria-label={`Decrease speed by ${step}`}'));
  assert.ok(numericControls.includes('density === "compact" ? 104 : Math.max(width ?? 152, 152)'));
  assert.ok(numericControls.includes('aria-label={ariaLabel}'));
  // Steppers keep their size but share a narrow shell with the value at larger text sizes.
  assert.ok(numericControls.includes('width: density === "compact" ? "min(48px, 46%)" : "min(80px, 42%)"'));
  assert.ok(numericControls.includes('style={{ width: "100%", height: density === "compact" ? 26 : 42 }}'));
});

test("timing controls expose visible drag affordances and source-aware max duration", () => {
  assert.ok(!elementMenu.includes("Drag values left or right to adjust"));
  assert.equal(elementMenu.match(/<MoveHorizontalIcon/g)?.length ?? 0, 0, "Scrub fields carry their own drag affordance; no explanatory hint row");
  assert.ok(elementMenu.includes("getSourceDurationSeconds"));
  assert.ok(elementMenu.includes("getMaxExtendableTimelineDuration"));
  assert.ok(elementMenu.includes("Extend to source end"));
  assert.ok(elementMenu.includes("commitDuration(next)"));
  assert.ok(elementMenu.includes('fields={SPEED_KEYFRAME_FIELD} label="speed"'));
  assert.ok(elementMenu.includes("toggleSpeedStepAtTime"));
  assert.ok(elementMenu.includes("setSpeedAtTime"));
  assert.ok(elementMenu.includes("speedAtTimelineTime"));
});

test("timing controls expose exact clip position and a temporary snap bypass", () => {
  assert.ok(elementMenu.includes('ariaLabel="Timeline start numeric value"'));
  assert.ok(elementMenu.includes("step={1 / 30}"));
  assert.ok(elementMenu.includes("commitStart"));
  assert.ok(timelineToolbar.includes("Option bypasses"));
  assert.ok(timelineInteractions.includes("snapEnabledRef.current && !event.altKey"));
  assert.ok(timelineInteractions.includes("snapEnabledRef.current && !altKey"));
  assert.ok(timelineInteractions.includes("updateFromPointer(event.clientX, event.altKey)"));
});

test("waveform extraction decodes before asking autoplay permission and releases failed retries", () => {
  const firstDecode = clientPeaks.indexOf("decodeAudioData(arrayBuffer.slice(0))");
  const firstResume = clientPeaks.indexOf("ensureAudioContextRunning(audioCtx)");
  assert.ok(firstDecode >= 0 && firstDecode < firstResume);
  assert.ok(clientPeaks.includes("attemptedUrls.delete(batch[index]!)"));
});

test("Timing groups placement and source, and offers Extend only when the clip can grow", () => {
  // Placement (Start, Duration) then Source (used part, speed, direction); stills and captions keep only placement.
  assert.ok(elementMenu.includes('{hasSourceTiming ? <InspectorItemHeader title="Placement" /> : null}'));
  assert.ok(elementMenu.includes('<InspectorItemHeader title="Source" actions={canExtendToSourceEnd ? ('));
  assert.ok(elementMenu.includes("const canExtendToSourceEnd = !durationIsMax && availableTailSeconds != null && availableTailSeconds > 0.005;"));
  assert.ok(elementMenu.includes('aria-label="Extend to source end"'));
  // The used part shows once, as the range and its two exact values; no source-length summary or "Uses…" line.
  const vertical = elementMenu.slice(elementMenu.indexOf('<InspectorSection sectionId="timing" title="Timing">'), elementMenu.indexOf('<InspectorSection sectionId="audio" title="Audio">'));
  assert.ok(!vertical.includes("Source length"));
  assert.ok(!vertical.includes("Can extend to"));
  assert.ok(!vertical.includes("Used part"));
  assert.ok(!clipTrimRange.includes("Uses {seconds"));
  assert.ok(elementMenu.includes("getMaxExtendableTimelineDuration"));
});

test("caption word display lives in Words, not Timing", () => {
  assert.ok(captionMenu.includes('<InspectorHeading>Display</InspectorHeading>'));
  assert.ok(!captionMenu.includes('verticalSubpanel === "timing" && hasValidWordTimings'));
  // Every caption choice list names its options, so the trigger never shows a raw value.
  for (const block of captionMenu.split(/<Select\b(?=[\s>])/).slice(1).map(rest => rest.slice(0, rest.indexOf("</Select>")))) {
    if (block.includes("<SelectValue />")) assert.ok(block.slice(0, block.indexOf("<SelectTrigger")).includes("items="), block.slice(0, 120));
  }
});

test("source-bounded cutouts can jump to the editable speech segment", () => {
  assert.ok(elementMenu.includes("resolveEditableSpeechSourceElement"));
  assert.ok(elementMenu.includes("Cutout picture ends here"));
  assert.ok(elementMenu.includes("Open speech source"));
  assert.ok(elementMenu.includes("onSelectElement(editableSpeechSource.id)"));
});

test("transform Inspector exposes an independent reset beside every property", () => {
  assert.ok(propertyControl.includes("data-reset-field={fields}"));
  assert.ok(elementMenu.includes('commitVisualTransform("scale", "1")'));
  assert.ok(elementMenu.includes('commitVisualTransform("offsetX", "0")'));
  assert.ok(elementMenu.includes('commitVisualTransform("offsetY", "0")'));
  assert.ok(elementMenu.includes('commitMediaEffect("opacity", "100")'));
});

test("transform Inspector exposes a clip-safe clear-all-keyframes action", () => {
  assert.ok(elementMenu.includes("Clear all keyframes"));
  assert.ok(elementMenu.includes("disabled={!selectedElement || !hasVisualKeyframes}"));
  assert.ok(elementMenu.includes("clearVisualKeyframes();"));
  assert.ok(!elementMenu.includes("without changing its cut, timing, or static values"));
  assert.ok(!elementMenu.includes("Clear animation"));
});

test("visual motion presets stay native, editable, and self-explanatory", () => {
  assert.ok(!elementMenu.includes('label="Explain motion presets"'));
  assert.ok(elementMenu.includes('aria-label="Motion preset"'));
  for (const label of ["Still", "Float", "Bounce", "Orbit"]) {
    assert.ok(elementMenu.includes(`label: "${label}"`), `${label} motion option is missing`);
  }
  const motionPickerStart = elementMenu.indexOf("function MotionPresetControl");
  const motionPicker = elementMenu.slice(motionPickerStart, elementMenu.indexOf("\nfunction ", motionPickerStart + 1));
  assert.ok(motionPicker.includes('role="radiogroup"'));
  assert.ok(motionPicker.includes('role="radio"'));
  assert.ok(!motionPicker.includes("<Select"));
});

test("Animation distinguishes movement across a clip from visible start and end effects", () => {
  assert.ok(elementMenu.includes("Move during the clip"));
  assert.ok(elementMenu.includes('<InspectorItemHeader title={isIn ? "Entrance" : "Exit"}'));
  assert.ok(elementMenu.includes('side={isIn ? "start" : "end"}'));
  assert.ok(elementMenu.includes("function AnimationEffectSelector"));
  assert.ok(elementMenu.includes('<InspectorVisualChoice initialLimit={6} label={label}'));
  assert.ok(!elementMenu.includes('>In</button>'));
  assert.ok(!elementMenu.includes('>Out</button>'));
});

test("Compact framing retains motion presets and Select portals keep the active editor palette", () => {
  assert.ok(elementMenu.includes('<MotionPresetControl value={motionPreset} onValueChange={applyMotionPreset}'));
  const transformSection = elementMenu.slice(
    elementMenu.indexOf('sectionId="placement"'),
    elementMenu.indexOf("<VisualFramingEditor", elementMenu.indexOf('sectionId="placement"')),
  );
  assert.ok(transformSection.includes("<InspectorPropertyControl"));
  assert.ok(!transformSection.includes("<MotionPresetControl"));
  assert.ok(!elementMenu.includes("border-white/10 bg-[var(--chrome-panel)]"));
  for (const selector of ['html[data-editor-theme="light"]', 'html[data-editor-theme="dark"]']) {
    assert.ok(editorGlassCss.includes(selector), `${selector} must theme portal content`);
  }
  assert.ok(editorGlassCss.includes("--popover: #f0f5fa"));
  assert.ok(editorGlassCss.includes("--popover: #282e35"));
  assert.ok(editorGlassCss.includes("control menu is a working surface"));
});

test("normal Properties excludes cutout diagnostics and restores the composite", () => {
  assert.ok(!elementMenu.includes("function CutoutReviewControl"));
  assert.ok(!elementMenu.includes("value={cutoutReviewMode}"));
  assert.ok(elementMenu.includes('if (cutoutReviewMode === "composite") return;'));
  assert.ok(elementMenu.includes('setCutoutReviewMode("composite")'));
  assert.ok(!timelineStep.includes("viewerControlsNode"));
  assert.ok(!timelineStep.includes('aria-label="Cutout preview view"'));
});

test("the help-icon modal is gone; controls explain themselves", () => {
  assert.equal(fs.existsSync(path.resolve(timelineDir, "../../ui/help-tooltip.tsx")), false);
});

test("project header and export dialog use readable neutral glass surfaces", () => {
  assert.ok(projectVersionHeader.includes("editor-chrome timeline-project-header"));
  assert.ok(projectVersionHeader.includes("timeline-project-nav"));
  const exportDialog = fs.readFileSync(path.resolve(timelineDir, "ExportDialog.tsx"), "utf8");
  assert.ok(timelineStep.includes("<ExportDialog"));
  // Dialogs use the shared stacking scale (globals.css), which keeps them above the project header.
  assert.match(exportDialog, /className="timeline-export-backdrop [^"]*z-\(--layer-dialog\)/);
  assert.match(exportDialog, /className="editor-chrome timeline-export-dialog /);
  assert.ok(exportDialog.includes('aria-labelledby="timeline-export-title"'));
  // Enter on the header's Export opens the dialog; a second Enter must not start an export.
  assert.ok(exportDialog.includes("titleRef.current?.focus({ preventScroll: true })"));
  assert.ok(!/autoFocus[^>]*onClick=\{props\.(onExport|onRetry)\}/.test(exportDialog));
  // The quality-check export warning is covered by the quality-checks contract above.
  for (const selector of [".timeline-project-header", ".segmented-control", ".timeline-export-backdrop", ".timeline-export-dialog"]) {
    assert.ok(globalsCss.includes(selector), `${selector} glass style is missing`);
  }
});

test("header actions share the appearance and navigation control geometry", () => {
  assert.ok(editorGlassCss.includes("--header-control-height: 40px"));
  assert.ok(editorGlassCss.includes("height: var(--header-control-height)"));
  assert.ok(editorGlassCss.includes("background: var(--glass-control)"));
  // Outlines come from the shared shape tokens (editor-visual-system.md#shape).
  assert.ok(editorGlassCss.includes("border: 1px solid var(--edge-outline)"));
  assert.ok(editorGlassCss.includes("0 2px 8px rgb(22 55 80 / 10%)"));
});

test("caption Inspector exposes readable position sliders without a help icon", () => {
  assert.ok(captionMenu.includes("Horizontal (X)"));
  assert.ok(captionMenu.includes("Vertical (Y)"));
  assert.ok(captionMenu.includes("<Slider"));
  assert.ok(captionMenu.includes("<ScrubNumberInput"));
  assert.ok(!captionMenu.includes("HelpTooltip"));
  assert.ok(captionMenu.includes("Horizontal (X) %"));
  assert.ok(captionMenu.includes("Apply this style to the whole lane"));
  assert.ok(captionMenu.includes("Text box width"));
  assert.ok(captionMenu.includes('label="caption text box width"'));
  assert.ok(captionMenu.includes("Text alignment"));
  assert.ok(captionMenu.includes('aria-label="Text alignment"'));
  assert.ok(captionMenu.includes('ariaLabel={`${label} numeric value`}'));
  assert.ok(captionMenu.includes('ariaLabel="Caption text box width numeric value"'));
  assert.ok(captionMenu.includes('ariaLabel="Caption font size numeric value"'));
  assert.ok(captionMenu.includes('label="caption font size"'));
  assert.ok(!captionMenu.includes("Alignment places text inside its box"));
  assert.ok(!captionMenu.includes('aria-label="Caption letter case"'));
  assert.ok(!captionMenu.includes("Paragraph build"));
});

test("caption Inspector exposes first-class wall-plane depth controls", () => {
  for (const label of ["Surface", "Depth (Z)", "Perspective", "Tilt (X)", "Turn (Y)", "Rotate (Z)", "Softness", "Material blend"]) {
    assert.ok(captionMenu.includes(label), `${label} wall-plane control is missing`);
  }
  assert.ok(captionMenu.includes('surfaceMode: "wall"'));
  assert.ok(captionMenu.includes('surfaceBlendMode: "multiply"'));
  assert.ok(!captionMenu.includes("Place display text on the filmed wall"));
});

test("caption domains separate text, layout, animation and timing without duplicate navigation", () => {
  assert.ok(inspectorPanel.includes('ariaLabel="Caption inspector panels"'));
  assert.ok(inspectorPanel.includes('tabs={CAPTION_INSPECTOR_TABS.filter'));
  const tabs = captionMenu.slice(captionMenu.indexOf('export const CAPTION_INSPECTOR_TABS'), captionMenu.indexOf('export const CAPTION_INSPECTOR_TABS') + 600);
  assert.deepEqual([...tabs.matchAll(/label: "([^"]+)"/g)].map(match => match[1]), ['Words', 'Layout', 'Animation', 'Timing']);
  // Caption Timing holds only Start, Duration and the speech link, which the shared Timing section renders.
  for (const domain of ['text', 'position', 'motion']) assert.ok(captionMenu.includes(`verticalSubpanel === "${domain}"`));
  assert.ok(inspectorPanel.includes("showInspectorTabs={false}"));
  assert.ok(captionMenu.includes('<InspectorDisclosure title="Perspective"'));
  assert.ok(!captionMenu.includes('grid-cols-2'));
  for (const label of ["Extrusion walls", "Depth (Z)", "Bevel", "Wall light", "Mirror", "Wall colour", "Wall view X", "Wall view Y"]) assert.ok(captionMenu.includes(label));
});

test("caption size previews and commits across the selected caption batch", () => {
  assert.ok(timelineInspector.includes("buildCaptionFontSizePatches"));
  assert.ok(timelineInspector.includes('selectedElements.filter((element) => element.type === "caption_text")'));
  assert.ok(timelineInspector.includes("setSelectedVisualGroupPreviewProps"));
  assert.ok(timelineInspector.includes("if (patches.length > 1) void patchElements(patches)"));
});

test("caption font picker carries editor tokens into its portal and loads real preview faces", () => {
  assert.ok(captionMenu.includes('"editor-chrome min-w-[220px]'));
  assert.ok(captionMenu.includes("bg-[var(--chrome-panel)]"));
  assert.ok(timelineLayout.includes("timelineFontVariablesClassName"));
  assert.ok(timelineLayout.includes("style={timelineFontVariablesStyle}"));
  assert.ok(timelineFonts.includes("sharedFontCssVariables()"));
  assert.ok(!timelineFonts.includes("next/font/google"), "editor startup must not depend on a build-time Google Fonts fetch");
  assert.ok(captionMenu.includes("useEffect(linkGoogleFontsStylesheet, [])"));
  const variables = sharedFontCssVariables();
  for (const [token, family] of [["--font-archivo-black", "'Archivo Black'"], ["--font-dm-serif-display", "'DM Serif Display'"], ["--font-script-hand", "'Great Vibes'"], ["--font-jetbrains-mono", "'JetBrains Mono'"]]) {
    assert.equal(variables[token], family, `${token} does not resolve to a loadable family`);
  }
});

test("3D title clips open on clearly named effect controls instead of generic caption content", () => {
  assert.ok(captionMenu.includes('label: "Animation"'));
  assert.ok(!captionMenu.includes('captionProps.styleVariant === "camera_reveal" ? "motion" : "content"'));
  assert.ok(captionMenu.includes('"3D camera reveal"'));
  assert.ok(captionMenu.includes("{cameraRevealControls ?? inverseMaskControls}"));
});

test("image-filled titles expose page-change motion without compiling the montage", () => {
  for (const label of [
    "Page change",
    "Hard cut",
    "Dissolve",
    "Slide",
    "Transition time",
    "Slide direction",
    "Motion blur",
    "Image drift",
    "Weight",
    "Image framing",
    "Follow camera",
    "Fill wordmark",
    "Opening hold",
    "Fill image playback order",
    "Advanced source details",
  ]) {
    assert.ok(captionMenu.includes(label), `${label} image-sequence control is missing`);
  }
  assert.ok(captionMenu.includes('mediaFillTransition === "slide"'));
  assert.ok(captionMenu.includes("mediaFillTransitionBlur"));
  assert.ok(captionMenu.includes("mediaFillSlideDirection"));
});

test("media domains follow the approved order and omit unsupported panels", () => {
  const start = elementMenu.indexOf('const verticalSubpanels');
  const panels = elementMenu.slice(start, elementMenu.indexOf('const defaultVerticalSubpanel', start));
  assert.deepEqual([...panels.matchAll(/label: "([^"]+)"/g)].map(match => match[1]), ['Layout', 'Color', 'Mask', 'Effects', 'Animation', 'Audio', 'Timing']);
  assert.ok(!panels.includes('Style'));
  assert.ok(panels.includes('runtime_source_has_audio === false'));
  assert.ok(elementMenu.includes('visibleInspectorSections(activeVerticalSubpanel'));
  assert.ok(elementMenu.includes('activeVerticalSubpanel === "mask"'));
  assert.ok(elementMenu.includes('verticalSubpanels.length > 1'));
});

test("Inspector tabs share one accessible keyboard primitive and survive selection changes", () => {
  for (const source of [elementMenu, captionMenu, inspectorPanel]) {
    assert.ok(source.includes("<InspectorPanelTabs"));
  }
  assert.ok(inspectorPanelTabs.includes('role="tablist"'));
  assert.ok(inspectorPanelTabs.includes('role="tab"'));
  assert.ok(inspectorPanelTabs.includes('aria-selected={active}'));
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    assert.ok(inspectorPanelTabs.includes(`"${key}"`), `${key} navigation is missing`);
  }
  assert.ok(inspectorPanelTabs.includes("tab.disabled ? [] : [index]"));
  assert.ok(inspectorPanelTabs.includes('aria-orientation="horizontal"'));
  // Every domain stays visible: tabs fill even grid rows rather than scrolling out of view (2026-10-10 audit, grid 2026-10-24).
  assert.ok(inspectorPanelTabs.includes("gridTemplateColumns") && !inspectorPanelTabs.includes("overflow-x-auto"));
  assert.ok(inspectorPanelTabs.includes("scrollIntoView"));
  assert.ok(!inspectorPanelTabs.includes("truncate"));
  assert.ok(inspectorPanel.includes("const [localInspectorSubpanel, setLocalInspectorSubpanel]"));
  assert.ok(inspectorPanel.includes("const setElementInspectorSubpanel ="));
  assert.ok(inspectorPanel.includes("const [captionInspectorSubpanel, setCaptionInspectorSubpanel]"));
  assert.ok(inspectorPanel.includes('!selectedElement.props?.surface_track && captionInspectorSubpanel === "motion" ? "motion" : "timing" : elementInspectorSubpanel'));
  assert.ok(inspectorPanel.includes('inspectorSubpanel={captionInspectorSubpanel === "keyframe" || (selectedElement.props?.surface_track && captionInspectorSubpanel === "motion") ? "text" : captionInspectorSubpanel}'));
  assert.ok(!elementMenu.includes('setVerticalSubpanel("timing")'));
  assert.ok(!captionMenu.includes('setVerticalSubpanel("text")'));
});

test("3D camera reveal has human-editable camera, timing, and blur controls", () => {
  for (const label of [
    "Start time",
    "Pullback",
    "Start distance",
    "End distance",
    "Start target X",
    "Start target Y",
    "Wall view X",
    "Wall view Y",
    "Field of view",
    "Camera easing",
    "Shutter angle",
    "Blur samples",
  ]) {
    assert.ok(captionMenu.includes(label), `${label} 3D reveal control is missing`);
  }
  assert.ok(captionMenu.includes("Reset 3D reveal"));
  assert.ok(captionMenu.includes("3D sizing"));
  assert.ok(captionMenu.includes("Match font size"));
  assert.ok(perspectiveReveal.includes("<ThreeCanvas"));
  assert.ok(perspectiveReveal.includes("<StableCameraMotionBlur"));
  assert.ok(perspectiveReveal.includes("cameraRevealBlurPixels({ props, frame: currentFrame, fps, shutterAngle, samples })"));
  assert.ok(perspectiveReveal.includes("<PerspectiveTitleRevealFrame props={props} frame={currentFrame} />"));
  assert.ok(!perspectiveReveal.includes("<CameraMotionBlur"));
  assert.ok(perspectiveReveal.includes("rasterizeTextToShapes"));
  assert.ok(perspectiveReveal.includes("captionRemotionFontFamily(props.fontPreset)"));
  assert.ok(perspectiveReveal.includes("new ExtrudeGeometry"));
  assert.ok(perspectiveReveal.includes("bevelSegments: 8"));
  assert.ok(perspectiveReveal.includes("posedCamera.lookAt"));
  assert.ok(perspectiveReveal.includes("rotation: ["));
});

test("inverse text exposes editable matte drift and light-sweep controls", () => {
  for (const label of [
    "Inverse mask motion",
    "Mask motion",
    "Horizontal",
    "Vertical",
    "Light sweep",
    "Sweep passes",
  ]) {
    assert.ok(captionMenu.includes(label), `${label} inverse mask control is missing`);
  }
  assert.ok(timelineComposition.includes("inverseMaskDriftXPercent"));
  assert.ok(timelineComposition.includes("inverseMaskSweepIntensity"));
});

test("3D title brand-card resolve keeps the reference transition editable", () => {
  for (const label of [
    "Brand card ending",
    "Resolve to brand card",
    "Resolve starts",
    "Resolve length",
    "Card colour",
    "Logo colour",
  ]) {
    assert.ok(captionMenu.includes(label), `${label} brand resolve control is missing`);
  }
  assert.ok(perspectiveReveal.includes("resolveBackgroundProgress"));
  assert.ok(perspectiveReveal.includes("resolveTextProgress"));
  assert.ok(perspectiveReveal.includes("resolveTextColor"));
});

test("visual Inspector keeps wall placement geometric and leaves appearance in Transform", () => {
  const surfaceStart = elementMenu.indexOf("function MediaSurfaceControls");
  const surfaceEnd = elementMenu.indexOf("/* ── SpeedScrub", surfaceStart);
  const mediaSurfaceControls = elementMenu.slice(surfaceStart, surfaceEnd);
  assert.ok(elementMenu.includes("function MediaSurfaceControls"));
  assert.ok(elementMenu.includes('sectionId="perspective"'));
  assert.ok(!elementMenu.includes("Tilt, turn and distort the picture."));
  for (const label of ["Depth", "Perspective", "Tilt", "Turn", "Rotate", "Horizontal skew", "Vertical skew"]) {
    assert.ok(elementMenu.includes(`label="${label}"`) || elementMenu.includes(`>${label}<`), `${label} visual surface control is missing`);
  }
  for (const removedLabel of ["Softness", "Surface opacity", "Material blend"]) {
    assert.ok(!mediaSurfaceControls.includes(`label="${removedLabel}"`) && !mediaSurfaceControls.includes(`>${removedLabel}<`), `${removedLabel} should not be a media surface control`);
  }
  assert.ok(elementMenu.includes("enableWallSurface"));
  assert.ok(elementMenu.includes("resolveSurfacePlaneProps"));
  assert.ok(elementMenu.includes('aria-label="3D transform"'));
  assert.ok(elementMenu.includes('surface.mode === "wall" ? "On" : "Off"'));
  assert.ok(elementMenu.includes('label="Opacity" fields="media_opacity"'));
  assert.ok(elementMenu.includes("<MediaSurfaceControls\n                    compact"));
});

test("header Library and Proposals buttons are bordered like Export and show their open drawer", () => {
  // One CSS owner gives both panel buttons the header's bordered surface (same tokens as Export and Undo).
  assert.equal(timelineToolbar.match(/className="workspace-panel-button"/g)?.length, 2);
  assert.match(editorGlassCss, /\.editor-chrome button\.workspace-panel-button \{\s*border: 1px solid var\(--edge-outline\);[^}]*background: var\(--glass-control\);/);
  // Selected look keys off aria-pressed, which follows the drawer's real open state,
  // so closing by shortcut, Escape or the drawer's X reverts it.
  assert.match(editorGlassCss, /\.editor-chrome button\.workspace-panel-button\[aria-pressed="true"\] \{[^}]*background: var\(--chrome-selected-bg\);[^}]*var\(--chrome-selected-ring\)/);
  assert.ok(timelineToolbar.includes("aria-pressed={mediaOpen}"));
  assert.ok(timelineToolbar.includes("aria-pressed={proposalsOpen}"));
  assert.ok(timelineStep.includes("proposalsOpen={reviewDrawerOpen}"));
  assert.ok(timelineStep.includes("mediaOpen={libraryDrawerOpen}"));
});

test("caption clips prioritize their text over repeated lane metadata", () => {
  assert.ok(timelineScene.includes('ctx.font = "700 14px var(--font-sans, sans-serif)"'));
  assert.ok(timelineScene.includes("clipY + clipHeight / 2 + 0.5"));
  assert.ok(timelineScene.includes("if (isCaptionElement)"));
});

test("editor toolbar keeps tall-layout controls on one row with named compact buttons", () => {
  assert.ok(timelineToolbar.includes('flexWrap: "nowrap"'));
  assert.ok(timelineToolbar.includes('overflowX: "auto"'));
  assert.ok(timelineToolbar.includes('aria-label="Open Library"'));
  assert.ok(timelineToolbar.includes('aria-label={`Open Proposals${pendingProposalCount > 0 ? `, ${pendingProposalCount} to review` : ""}${proposalPreviewActive ? ". Temporary proposal preview active." : ""}${proposalModeActive && !proposalPreviewActive && proposalsShownCount > 0 ? `. Showing ${proposalsShownCount} checked on the timeline.` : ""}`}'));
  // Library and Proposals name their drawers in the header; the words fold away (kept for screen readers) in narrow windows.
  assert.ok(timelineToolbar.includes('minWidth: compactPanels ? 36 : undefined'));
  assert.ok(timelineToolbar.includes("aria-pressed={mediaOpen}"));
  assert.ok(!timelineToolbar.includes('{isTallLayout ? (isVertical ? "Tall" : "Wide") : null}'));
  assert.ok(timelineToolbar.includes('aria-label="Preview view"'));
  assert.ok(timelineToolbar.includes('aria-label="Timeline view"'));
  // Timeline width and lane height are peer workspace-scale controls.
  assert.ok(timelineToolbar.includes('label="Seconds visible across timeline"'));
  assert.ok(timelineToolbar.includes("onVisibleSecondsChange"));
  assert.ok(!timelineToolbar.includes('onFitAll'));
  assert.ok(timelineToolbar.includes('joined="start"'));
  assert.ok(timelineToolbar.includes('joined="end"'));
  assert.ok(timelineToolbar.includes('label="Lane height"'));
  assert.ok(timelineToolbar.includes("onLaneHeightPercentChange"));
  assert.ok(timelineToolbar.includes("Pull down to increase"));
  // Minus above, plus below, with space so neither meets the control's edge.
  assert.ok(timelineToolbar.includes('M3 2.5H9'));
  assert.ok(timelineToolbar.includes('M3 19H9M6 16V21.25'));
  assert.ok(timelineToolbar.includes('maxHeight: "calc(100% - 8px)"'));
  assert.ok(timelineToolbar.includes('flex: icon ? "0 0 100px" : undefined'));
  assert.ok(timelineToolbar.includes('joined === "start" ? "var(--edge-control) 0 0 var(--edge-control)"'));
  assert.ok(timelineToolbar.includes("TimelineVisibleSecondsControl"));
  assert.ok(timelineToolbar.includes('unit="seconds"'));
  assert.ok(!timelineToolbar.includes(': "Library"'));
  assert.ok(timelineToolbar.includes("{editingControls}"));
  assert.ok(timelineToolbar.includes('aria-label="Timeline editing"'));
  assert.ok(timelineToolbar.includes("<MagnetIcon"));
  assert.ok(timelineToolbar.includes("<ScissorsIcon"));
  assert.ok(timelineToolbar.includes("onClick={onSplitSelected}"));
  assert.ok(timelineToolbar.includes("disabled={!selectedElement}"));
  assert.ok(timelineToolbar.includes("{panelControls}"));
  assert.ok(timelineToolbar.includes("{previewViewControls}"));
  assert.ok(!timelineToolbar.includes('width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start"'));
});

test("the timeline toolbar stays global while both Properties headers own selection actions", () => {
  assert.ok(!timelineToolbar.includes("showSelectionControls"));
  assert.ok(!timelineToolbar.includes("<SelectedClipActions"));
  // Tall and wide layouts both render the shared Properties panel, which owns the selection actions.
  assert.ok(timelineStep.includes('hidden={toolsCollapsed || shelfOpen || layoutsOpen}>{!propertiesInDrawer && landscapeRightPanelNode("inspector", expandButton("properties"))}</div>'));
  assert.ok(landscapeRightPanel.includes("<SelectedClipActions"));
  assert.ok(selectedClipActions.includes('aria-label="Clip actions"'));
  assert.ok(selectedClipActions.includes('aria-label="Split selected clip at playhead"'));
  assert.ok(selectedClipActions.includes('aria-label="Duplicate selected clip"'));
  assert.ok(selectedClipActions.includes('aria-label="Remove selected clips from timeline"'));
});

test("fullscreen stays with the preview view controls instead of the project actions", () => {
  assert.ok(projectVersionHeader.includes('id="timeline-project-header-actions"'));
  assert.ok(timelineStep.includes('createPortal('));
  // Fullscreen is a preview view option: the shared preview controls render it and portal it
  // into the preview's own corner slot, separate from the header's export and edit actions.
  assert.ok(previewControls.includes('aria-label={fullscreen ? "Exit preview fullscreen" : "Expand preview"}'));
  assert.ok(previewControls.includes("<Maximize aria-hidden"));
  assert.ok(previewControls.includes("createPortal(viewerOptions, settingsTarget)"));
  assert.ok(!projectVersionHeader.includes('className="workspace-preview-settings"'));
  assert.ok(timelinePlaybackShell.includes('<div ref={setSettingsActions} className="editor-viewer-corner-slot" />'));
  // Outside the Editor the slot keeps its shape while Library remains available.
  // The stand-ins render in every section, the editor included, so the header keeps its shape while the editor loads.
  assert.ok(projectVersionHeader.includes('<div ref={setEditActions} className="workspace-edit-actions"><EditorOnlyActions editorLoading={activeView === "editor"} /></div>'));
  assert.ok(editorGlassCss.includes(':has(> :not(.editor-only-placeholder)) > .editor-only-placeholder { display: none !important; }'));
  assert.ok(timelinePlaybackShell.includes("settingsTarget={settingsActions ?? undefined}"));
  // The workspace stays mounted while the player expands on its own.
  assert.ok(!timelinePlaybackShell.includes("return isFullscreen"));
  assert.ok(framePlayer.includes("onToggleFullscreen={api.toggleFullscreen}"));
});

test("video shape is a visible preview setting saved as the project output, and the layout follows it", () => {
  const shapeControl = fs.readFileSync(new URL("./VideoShapeControl.tsx", import.meta.url), "utf8");
  const aspectRatios = fs.readFileSync(new URL("../../../lib/aspect-ratios.ts", import.meta.url), "utf8");
  const previewSettings = fs.readFileSync(new URL("./PreviewPlaybackSettings.tsx", import.meta.url), "utf8");
  const viewport = fs.readFileSync(new URL("./useTimelineViewport.ts", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("./useTimelineEditor.ts", import.meta.url), "utf8");
  // One shared segmented control with the four supported shapes, labelled without help text.
  assert.ok(shapeControl.includes('<SegmentedControl size="sm" fill role="group" aria-labelledby="video-shape-label">'));
  assert.ok(shapeControl.includes('<SettingField label="Shape" labelId="video-shape-label">'));
  assert.ok(shapeControl.includes("export const VIDEO_SHAPES = TIMELINE_ASPECT_RATIO_VALUES;"));
  assert.ok(aspectRatios.includes('TIMELINE_ASPECT_RATIO_VALUES = ["9:16", "4:5", "1:1", "16:9"]'));
  assert.ok(shapeControl.includes('"1:1": { width: 10, height: 10 }'));
  // It leads the gear panel and writes the same value Export edits, through the undoable route.
  assert.ok(previewSettings.indexOf("{shape}") < previewSettings.indexOf("<PreviewQualitySettings"));
  assert.ok(timelineStep.includes("shapeControl={<VideoShapeControl value={aspectRatio} disabled={outputFormatSaving} onChange={(value) => void persistOutputAspectRatio(value)} />}"));
  assert.ok(timelineStep.includes("onAspectRatioChange={(value) => void persistOutputAspectRatio(value as PreviewAspectRatio)}"));
  assert.match(editor, /const persistOutputAspectRatio[\s\S]*?buildExternalSnapshotHistoryEntry[\s\S]*?recordHistoryEntry\(historyEntry\)/);
  // The layout follows the loaded shape (including Undo and agent refreshes) one way only.
  assert.ok(editor.includes("useTimelineViewport({ projectId, totalDuration, outputAspectRatio: aspectRatio, ready: !loading })"));
  assert.ok(viewport.includes("setLayoutState(workspaceLayoutForShape(outputAspectRatio));"));
  assert.ok(viewport.includes("serializeWorkspaceLayoutChoice(layout, outputAspectRatio)"));
  assert.ok(!viewport.includes("persistOutputAspectRatio"));
});

test("guides stay with the preview view options and appearance stays global", () => {
  assert.ok(!projectVersionHeader.includes('id="timeline-platform-preview-header"'));
  assert.ok(!projectVersionHeader.includes("<EditorAppearanceControl />"));
  // Guides moved from the toolbar into the Preview settings panel as its accessory section.
  assert.ok(timelineStep.includes("viewerAccessory={<PlatformPreviewControl"));
  assert.ok(timelinePlaybackShell.includes("settings={<PreviewPlaybackSettings shape={shapeControl} accessory={viewerAccessory}"));
  assert.ok(!timelineStep.includes("<EditorAppearanceControl />"));
  assert.ok(!timelineStep.includes("headerPlatformPreviewTarget"));
  // Theme is a three-way toggle (Dark · Light · System); Light matches Claude Code's light theme.
  assert.ok(editorAppearance.includes('aria-labelledby="editor-theme-label"'));
  assert.ok(editorAppearance.includes('useState<Appearance>("dark")'));
  assert.ok(editorAppearance.includes('[["dark", "Dark"], ["light", "Light"], ["system", "System"]]'));
  const settings = fs.readFileSync(new URL('./EditingMemory.tsx', import.meta.url), 'utf8');
  assert.ok(settings.includes('<EditorAppearanceSettings />'));

});

test("timeline transport spreads editing and playback without duplicating zoom", () => {
  // Playback moved into the shared preview controls, floated over the Preview; edit
  // history moved into the timeline toolbar. Neither duplicates timeline zoom.
  assert.ok(previewControls.includes('aria-label="Go to previous edit point"'));
  assert.ok(previewControls.includes('aria-label="Go to next edit point"'));
  const previous = previewControls.indexOf('aria-label="Go to previous edit point"');
  const play = previewControls.indexOf("aria-label={label}", previous);
  const next = previewControls.indexOf('aria-label="Go to next edit point"', play);
  assert.ok(previous < play && play < next, "edit-point skips must surround Play");
  assert.ok(timelineStep.includes("previousTimelineEditPointFrame"));
  assert.ok(timelineStep.includes("nextTimelineEditPointFrame"));
  assert.ok(timelinePlaybackShell.includes('<div ref={setControlsTarget} className={`editor-floating-transport'));
  assert.ok(editorWorkspaceCss.includes(".editor-floating-transport {"));
  assert.ok(timelineStep.includes('<div className="timeline-history-controls" role="group" aria-label="Undo, history and redo">'));
  // Without the chat dock, marks return to the timeline toolbar beside Undo/History/Redo.
  // Undo/History/Redo and the panel buttons move to the header; marks stay with the timeline.
  assert.ok(timelineStep.includes("historyControls={historyControls}"));
  // Everything selected for the agent joins the toolbar when there is no chat dock and keeps its slot
  // while empty, so selecting a clip never moves Marks or the zoom controls. Wide puts it left of Marks;
  // tall puts it beside the view controls, so the empty slot never pushes Marks off the left edge.
  assert.ok(timelineStep.includes("reviewControls={dock ? undefined : marksNode}"));
  assert.ok(timelineStep.includes("selectionControls={dock || !agentSelection ? undefined : <SelectionTray"));
  assert.ok(timelineToolbar.includes("{selectionControls}{timelineViewControls}"));
  assert.ok(timelineToolbar.includes("{selectionControls}\n          {reviewControls}"));
  const selectionTray = fs.readFileSync(path.join(timelineDir, "SelectionTray.tsx"), "utf8");
  assert.ok(!selectionTray.includes("if (selections.length === 0) return null"), "the selection group must not unmount when empty");
  assert.ok(selectionTray.includes('...(empty ? { visibility: "hidden" } : {})'), "the empty selection group reserves its width");
  assert.ok(timelineToolbar.includes("createPortal(<div role=\"group\" aria-label=\"Edit and panels\""));
  assert.ok(!timelineStep.includes('className="timeline-history-controls timeline-playback-controls"'));
  assert.ok(!globalsCss.includes(".timeline-zoom-control"));
  assert.ok(!timelineStep.includes('className="timeline-zoom-control"'));
  assert.ok(!timelineStep.includes('aria-label="Fit timeline to view"'));
  assert.ok(!timelineStep.includes("Fit\n            </Button>"));
  assert.ok(!timelineStep.includes('className="timeline-snap-control"'));
  assert.ok(!globalsCss.includes(".timeline-playback-controls .timeline-play-toggle"));
  assert.ok(!timelineStep.includes("timeline-play-toggle"));
});

test("timeline clip bodies advertise dragging without masking resize handles", () => {
  assert.ok(timelineInteractions.includes('hoveringClipElement?.position_locked ? "not-allowed" : "grab"'));
  assert.ok(timelineInteractions.indexOf('hoveringClipResize') < timelineInteractions.indexOf('hoveringClipElement?.position_locked'));
});

test("the tall-layout Inspector scrolls vertically and resizes from the timeline divider", () => {
  // The dedicated portrait bottom inspector was replaced by the shared tool region; the
  // shared resize handle sets the Properties/Timeline boundary in both layouts.
  assert.ok(timelinePlaybackShell.includes('<WorkspaceResizeHandle label="Resize timeline height" axis="y" reverse'));
  assert.ok(timelinePlaybackShell.includes("{bottom:timelineSize.value-4,right:0,width:tallRight}"));
  assert.ok(workspaceResize.includes("e.currentTarget.setPointerCapture(e.pointerId)"));
  assert.ok(landscapeRightPanel.includes('<div ref={inspectorScrollRef} style={{ display: "flex", flexDirection: "column", flex: "1 1 0%", minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>'));
  assert.ok(!timelineStep.includes("portrait-bottom-panel-resize-handle"));
  assert.ok(!timelineStep.includes("GripHorizontalIcon"));
  assert.ok(!timelineStep.includes("portrait-inspector-header"));
});

test("the tall-layout contextual Inspector stays clear of the playback transport", () => {
  // Playback floats inside the Preview, so selected-item controls in the tool region never cover it.
  const viewer = timelinePlaybackShell.indexOf('<section aria-label="Preview" className="editor-viewer">');
  const tools = timelinePlaybackShell.indexOf('<section aria-label="Library and Properties" className="editor-tools">');
  assert.ok(viewer >= 0, "The Preview region is missing");
  assert.ok(tools > viewer, "The contextual Inspector region is missing");
  assert.ok(timelinePlaybackShell.includes("editor-floating-transport"));
  assert.ok(!timelineStep.includes('data-testid="persistent-bottom-transport"'));
});

test("lane menus expose batch selection with caption-specific language", () => {
  assert.ok(timelineContextMenu.includes('onSelectLaneElements: (laneKey: string) => void'));
  assert.ok(timelineContextMenu.includes('isCaptionsLane(lane.key) ? "Select all captions" : "Select all clips"'));
});

test("caption Properties headers expose lane selection in tall and wide layouts", () => {
  // Both layouts render the shared Properties panel, which owns the caption-lane action.
  assert.ok(timelineStep.includes("onSelectCaptionLane={selectAllCaptionsInSelectedLane}"));
  assert.ok(landscapeRightPanel.includes('aria-label="Select all captions in this lane"'));
  assert.ok(landscapeRightPanel.includes("CaptionsIcon"));
  assert.ok(landscapeRightPanel.includes("onSelectCaptionLane"));
});

test("Properties collapse keeps a compact inline target in both layouts", () => {
  for (const source of [timelineStep, landscapeRightPanel]) {
    assert.ok(!source.includes('width: "min(180px, 34%)"'));
  }
  // Both layouts share LandscapeRightPanel; in the editor's tool rail, Library/Properties tabs replace collapse.
  assert.ok(landscapeRightPanel.includes('aria-label="Collapse Properties"'));
  assert.ok(landscapeRightPanel.includes("ChevronsDownIcon"));
  assert.ok(timelineStep.includes('onSelect: () => openToolPane("properties")'));
});

test("wide Properties keeps a remembered pointer and keyboard resizable boundary", () => {
  // The shell's bespoke divider became the shared WorkspaceResizeHandle, which remembers
  // its width per layout and owns pointer capture plus arrow-key resizing.
  // The remembered size is the preview's, so widening Chat shrinks the editing panel first.
  assert.ok(timelinePlaybackShell.includes('usePanelSize(`dreamcut:${layoutKey}:preview-width-v3`'));
  assert.ok(timelinePlaybackShell.includes("change: (next: number, persist?: boolean) => preview.change(workspaceWidth - next, persist)"));
  assert.ok(timelinePlaybackShell.includes('<WorkspaceResizeHandle label="Resize Library and Properties area" axis="x"'));
  assert.ok(workspaceResize.includes("localStorage.setItem(key, String(bounded))"));
  assert.ok(workspaceResize.includes("e.currentTarget.setPointerCapture(e.pointerId)"));
  assert.ok(workspaceResize.includes('const negative=axis==="x"?"ArrowLeft":"ArrowUp", positive=axis==="x"?"ArrowRight":"ArrowDown";'));
  assert.ok(!timelinePlaybackShell.includes('aria-label="Media"'));
  assert.ok(!landscapeRightPanel.includes('data-testid="landscape-library-inspector-resize-handle"'));
});

test("the side panel supports stable wide Properties and compact tabs", () => {
  assert.ok(landscapeRightPanel.includes('panelMode?: "tabs" | "inspector"'));
  assert.ok(landscapeRightPanel.includes('role={panelMode === "tabs" ? "tablist" : undefined}'));
  assert.ok(landscapeRightPanel.includes('aria-label={panelMode === "tabs" ? "Media and Properties" : "Properties"}'));
  assert.ok(landscapeRightPanel.includes('["library", "Media"]'));
  assert.ok(landscapeRightPanel.includes('["inspector", "Properties"]'));
  assert.ok(landscapeRightPanel.includes('id="right-panel-view-library"'));
  assert.ok(landscapeRightPanel.includes('id="right-panel-view-inspector"'));
  // Both views stay mounted and are toggled by display, so switching tabs never
  // discards the Library's tab, search text, or scroll position.
  assert.ok(landscapeRightPanel.includes('display: activeTab === "library" ? "flex" : "none"'));
  assert.ok(landscapeRightPanel.includes('display: panelMode === "inspector" || activeTab === "inspector" ? "flex" : "none"'));
  assert.ok(!landscapeRightPanel.includes("libraryWidthPct"));
});

test("stabilization remains an optional disclosure and routes to Effects", () => {
  assert.ok(!elementMenu.includes('{ id: "stabilize" as const'));
  assert.match(fs.readFileSync(new URL("./inspector-sections.ts", import.meta.url), "utf8"), /stabilization: \{ domain: "effects"/);
  const animation = elementMenu.indexOf('sectionId="animation"');
  const stabilization = elementMenu.indexOf('sectionId="stabilization"');
  assert.ok(stabilization > animation);
  const section = elementMenu.slice(stabilization, elementMenu.indexOf('</InspectorSection>', stabilization));
  assert.ok(section.includes('disclosure'));
  assert.ok(section.includes('defaultOpen={false}'));
  assert.ok(section.includes('{stabilizationControls}'));
});

test("the right panel follows the selection and a manual tab click pins until it changes", () => {
  assert.ok(landscapeRightPanel.includes("const selectionKey = ["));
  assert.ok(landscapeRightPanel.includes("if (selectionKey !== appliedSelectionKey) {"));
  assert.ok(landscapeRightPanel.includes('setActiveTab(hasInspectorContent ? "inspector" : "library");'));
  // A tab click only sets the tab — nothing re-applies the automatic tab until
  // the selection itself changes.
  assert.ok(landscapeRightPanel.includes("onClick={() => setActiveTab(id)}"));
});

test("selected-clip actions live in the wide layout's Inspector header, one click from the selection", () => {
  assert.ok(landscapeRightPanel.includes("<SelectedClipActions"));
  assert.ok(landscapeRightPanel.includes("onSplitSelected={onSplitSelected}"));
  assert.ok(landscapeRightPanel.includes("onDuplicateSelected={onDuplicateSelected}"));
  assert.ok(landscapeRightPanel.includes("onDeleteSelected={onDeleteSelected}"));
  // The header still names what is selected and how long it runs — the readout
  // the wide-layout toolbar strip used to carry.
  assert.ok(landscapeRightPanel.includes("selectedElement.duration.toFixed(2)"));
  assert.ok(timelineStep.includes("void splitElement(selectedElement.id, playheadSec)"));
});

test("the merged right panel has no help icon or help modal", () => {
  assert.ok(!landscapeRightPanel.includes("HelpTooltip"));
  assert.ok(!landscapeRightPanel.includes("About Properties"));
});
test("Recolor stays compact and follows existing grading in both inspector layouts", () => {
  const control = elementMenu.slice(elementMenu.indexOf("function RecolorControl"), elementMenu.indexOf("function InspectorGroupActions("));
  assert.ok(!control.includes("<fieldset"));
  assert.ok(!control.includes("<legend"));
  assert.ok(control.includes("inspector-property-row"));
  assert.ok(control.includes("<SliderScrubControl"));
  assert.ok(control.includes('data-recolor-controls'));
  const mounts = [...elementMenu.matchAll(/<RecolorControl element=/g)];
  assert.equal(mounts.length, 2);
  for (const mount of mounts) {
    const preceding = elementMenu.slice(0, mount.index);
    // Recolor follows the grade; the whole-grade actions (Reset color) lead the section.
    assert.ok(preceding.lastIndexOf("<ColorGradeControls") > preceding.lastIndexOf("Reset color</Button>"));
  }
});

test("rhythm maps separate visible marker families from snapping targets", () => {
  assert.ok(beatAnnotations.includes('label: "Beat grid"'));
  assert.ok(beatAnnotations.includes('label: "Drums"'));
  assert.ok(beatAnnotations.includes('label: "Synth / tonal"'));
  assert.ok(beatAnnotations.includes('label: "Other hits"'));
  assert.ok(beatAnnotations.includes('aria-label={`Show ${entry.label}`}'));
  assert.ok(beatAnnotations.includes('aria-label={`Snap to ${entry.label}`}'));
  assert.ok(beatAnnotations.includes('snapKinds.includes(marker.kind)'));
  assert.ok(!beatAnnotations.includes("HelpTooltip"));
});

test("rhythm controls are a peer Properties section instead of clip settings", () => {
  assert.ok(elementMenu.includes("rhythm: Boolean(beatControls)"));
  assert.ok(elementMenu.includes('<InspectorSection sectionId="rhythm" title="Rhythm">'));
  assert.ok(elementMenu.includes('<span style={columnHeaderStyle}>Rhythm</span>'));
  const clipSettingsMounts = [...elementMenu.matchAll(/>Clip settings<|title="Clip settings"/g)];
  assert.equal(clipSettingsMounts.length, 2);
  for (const mount of clipSettingsMounts) {
    const nearby = elementMenu.slice(mount.index, mount.index + 500);
    assert.ok(!nearby.includes("beatControls"));
  }
  assert.ok(!elementMenu.includes('text-sm font-semibold">Beats'));
});

test("music properties open the shared rhythm viewer for the selected clip", () => {
  assert.ok(beatAnnotations.includes('element.type === "music" && <Button'));
  assert.ok(beatAnnotations.includes('Review hits</Button>'));
  assert.ok(beatAnnotations.includes('sourceUrl: element.source_url!'));
  assert.ok(beatAnnotations.includes('<LibraryRhythmInspector'));
  assert.ok(timelineStep.includes('{musicalBeats.viewer}'));
});

test("music tools consolidate effects and rhythm in both Properties layouts", () => {
  assert.ok(elementMenu.includes('elementType === "music" && (audioEffectsControls || beatControls)'));
  assert.ok(elementMenu.includes("musicTools: Boolean(musicToolsControls)"));
  assert.ok(elementMenu.includes('<InspectorSection sectionId="music-tools" title="Music tools">'));
  assert.ok(!elementMenu.includes("HelpTooltip"));
  assert.ok(!beatAnnotations.includes("HelpTooltip"));
  assert.equal((elementMenu.match(/!musicToolsControls && beatControls/g) ?? []).length, 2);
  assert.ok(beatAnnotations.includes('aria-pressed={active}'));
  assert.ok(beatAnnotations.includes('Markers {active ? "on" : "off"}'));
});

test("properties rhythm viewer stays within the trimmed clip while Library inspection stays full-source", () => {
  assert.ok(beatAnnotations.includes('clip={inspectedTrack.clip}'));
  assert.ok(rhythmInspector.includes('clip?: TimelineElement'));
  assert.ok(rhythmInspector.includes('resolveMediaTiming({ ...clip, _source_duration: duration })'));
  assert.ok(rhythmInspector.includes('rhythmViewWindow(viewStart, viewSpan ?? rangeSpan, rangeStart, rangeEnd)'));
  assert.ok(rhythmInspector.includes('Math.max(rangeStart, Math.min(rangeEnd || audio.current?.duration || 0, seconds))'));
  assert.ok(rhythmInspector.includes('seek(windowStart); wantPlayback.current = true'));
  assert.ok(rhythmInspector.includes('setViewStart(rangeStart); }}>Fit'));
});

test("2026-10-10 audit: common clip tasks, own media and add actions are discoverable", () => {
  const contextMenu = fs.readFileSync(path.join(timelineDir, "TimelineContextMenu.tsx"), "utf8");
  const catalogTileCss = fs.readFileSync(path.join(timelineDir, "CatalogTile.module.css"), "utf8");
  // Right-click reaches speed/reverse and flip, routed to their single Properties home.
  assert.ok(contextMenu.includes('onOpenClipProperties(element.id, "timing")') && contextMenu.includes("Speed & direction…"));
  assert.ok(contextMenu.includes('onOpenClipProperties(element.id, "position")') && contextMenu.includes("Flip & rotate…"));
  assert.ok(timelineStep.includes('onOpenClipProperties={(elementId, domain) => { selectElement(elementId); setInspectorDomain(domain); openToolPane("properties"); }}'));
  // Library pictures/videos open on the creator's own media, with the catalog as a separate source.
  // Three buckets everywhere: This project, My library, Catalog (2026-10-24).
  assert.ok(assetShelf.includes('useState<LibraryBucket>("project")'));
  assert.ok(assetShelf.includes('LIBRARY_BUCKET_ORDER.map(value =>'));
  assert.ok(assetShelf.includes('chosen?: readonly string[]'), "a media host marks what it already holds as In Media");
  assert.ok(assetShelf.includes('!mediaPicker && librarySelection.sources.length > 0'), "a media host shows its own selection, so the shelf does not repeat it");
  assert.ok(!fs.readFileSync(path.join(timelineDir, "MediaWorkspaceTabs.tsx"), "utf8").includes('library: { label: "Library"'), "the header's Library button, not the tool rail, opens the Library drawer");
  assert.ok(assetShelf.includes('aria-label="Media source"'));
  assert.ok(!assetShelf.includes("HyperframesCompositionPanel"), "motion graphics creation is not a Library browse section");
  assert.ok(!assetShelf.includes('kind: "Image", label'), "selection pills derive their kind from the asset");
  // One add verb, always visible.
  assert.ok(!assetShelf.includes('"Add at playhead"}') && !assetShelf.includes("data-media-selection-footer"));
  assert.ok(!/\.add \{[^}]*opacity: 0/.test(catalogTileCss), "tile add buttons are not hover-only");
});

test("project tabs keep only the three most recently used projects, without reordering", () => {
  const workspaceTabs = fs.readFileSync(path.resolve(timelineDir, "../../../app/WorkspaceTabs.tsx"), "utf8");
  assert.ok(workspaceTabs.includes("const MAX_OPEN_TABS = 3;"));
  assert.ok(workspaceTabs.includes("while (next.length > MAX_OPEN_TABS)"));
  assert.ok(workspaceTabs.includes("id !== context"), "the project being opened is never the one closed");
});

test("applying or rejecting a card brings the next card up for review", () => {
  assert.ok(proposalsPanel.includes("advanceAfterDecision.current = true;"));
  assert.ok(proposalsPanel.includes("const option = options.find((candidate) => candidate.recommended) ?? options[0]!;"));
  assert.ok(proposalsPanel.includes("playKeyboardOption(next.proposal_id, option);"));
  assert.ok(proposalsPanel.includes("data-proposal-card={entry.proposal_id}"));
});

test("wave steps open and close freely, and a closed step still shows whether it is checked", () => {
  // Opening a step never closes another; the card's own button folds it back to its row.
  assert.ok(proposalsPanel.includes("aria-label={`Close step ${entry.wave.step}: ${entry.wave.title}`}"));
  assert.ok(proposalsPanel.includes("closeStep(wave.id, entry.proposal_id);"));
  // The row's checkbox reflects and changes the step's selection; the rest of the row opens it.
  assert.ok(proposalsPanel.includes("aria-label={`Select step ${wave.step}: ${wave.title} for review`}"));
  assert.ok(proposalsPanel.includes("checked={selectedOptions?.[entry.proposal_id] != null}"));
  assert.ok(proposalsPanel.includes("aria-label={`Open step ${wave.step}: ${wave.title}`}"));
});

test("a curve point a person adds can be removed again by key or button", () => {
  // Creator-eyes audit: points added by click or drag never took keyboard focus, so Delete did nothing.
  const curveGraph = fs.readFileSync(path.join(timelineDir, "CurveGraph.tsx"), "utf8");
  assert.ok(curveGraph.includes('frame.current?.focus({ preventScroll: true })'), "picking a point focuses the graph");
  assert.ok(curveGraph.includes('(event.key === "Delete" || event.key === "Backspace") && removable'), "Delete/Backspace remove the selected point");
  assert.ok(curveGraph.includes("Remove point"), "a visible remove action sits beside the point's numbers");
  assert.ok(curveGraph.includes("onDoubleClick={() => remove(index)}"), "double-click still removes");
});

test("proposal cards spend vertical space on dials, not on repeated or single-chip rows", () => {
  // Vertical density case (editor-ui-design/references/vertical-density-audit.md).
  assert.ok(proposalsPanel.includes("<ProposalKindChip isChoice={isChoice}") && proposalsPanel.includes("inline />"), "the kind chip sits inline with the title when no actions share its row");
  assert.ok(proposalsPanel.includes("singleSubject(option)"), "a single clip is named on the option row");
  const adjustments = fs.readFileSync(path.join(timelineDir, "ProposalAdjustments.tsx"), "utf8");
  assert.ok(adjustments.includes("!oneClip &&"), "no clip header over the dials when the option row names the one clip");
  const wheel = fs.readFileSync(path.join(timelineDir, "ColorWheel.tsx"), "utf8");
  assert.ok(wheel.includes("frameHeight = diameter + 4"), "direction words add width, not height");
  assert.ok(wheel.includes("actions={<span"), "the wheel readout shares the Exact values line");
});

test("whole-grade actions lead the Color tab in both layouts", () => {
  // The creator could not find the look actions at the bottom of a long tab (2026-10-24). They start
  // a timeline pick that drafts proposal cards, never an immediate change (2026-10-24).
  for (const anchor of ['<InspectorSection sectionId="color"', '<span style={columnHeaderStyle}>Color</span>']) {
    const section = elementMenu.slice(elementMenu.indexOf(anchor));
    const match = section.indexOf('onClick={() => startLookPick("match")}');
    assert.ok(match > 0 && match < section.indexOf("<ColorWaveform") && match < section.indexOf("<ColorGradeAdvancedControls"), anchor);
    assert.ok(section.indexOf('onClick={() => startLookPick("same")}') > 0);
  }
  assert.ok(!elementMenu.includes("Paste grade"));
});

test("picking a reference clip on the timeline drafts look cards instead of selecting it", () => {
  const step = fs.readFileSync(path.resolve(timelineDir, "../TimelineStep.tsx"), "utf8");
  const onSelect = step.slice(step.indexOf("onSelect={(elementId, options) => {"));
  assert.ok(onSelect.indexOf("if (lookPick)") < onSelect.indexOf("selectTransition(null)"));
  assert.ok(step.includes("/analysis/look-cards") && step.includes("/timeline/proposals"));
  assert.ok(step.includes('event.key === "Escape"'));
});

test("effect tiles show what each effect looks like and whether the clip has it", () => {
  // The creator could not tell the looks apart or see which were on (2026-10-24).
  const effects = fs.readFileSync(path.join(timelineDir, "ClipEffects.tsx"), "utf8");
  assert.ok(effects.includes("preview: `look-${effect}`") && effects.includes("preview: `effect-${effect}`"));
  assert.ok(effects.includes("text-[var(--proposal-positive)]") && effects.includes(">On</span>") && effects.includes(">Add</span>"));
  assert.ok(!/\{[^}]*\} applied<\/span>/.test(effects), "the applied count caption restated the tiles");
});
