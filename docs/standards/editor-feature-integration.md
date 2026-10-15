# Editor feature integration

Every addition or reorganization of an editor surface follows [editor-ui-design](../../.agents/skills/editor-ui-design/SKILL.md). The [UI architecture](../architecture/editor-ui.md) owns surface responsibilities; [inspector information architecture](inspector-information-architecture.md) owns domain placement and row behavior. Extend those authorities rather than creating another parallel design policy.

## Human independence

**A human must be able to understand and tweak an edit through the visible editor without AI assistance, code knowledge, or the conversation that created it.** Agent-authored work has the same obligation as manually authored work. Successful playback and technically editable values are insufficient if the creator cannot discover what to change.

Write every visible label in one or two everyday words a non-technical creator would use; never show ids, field names or engineering terms (see [editor-ui-design](../../.agents/skills/editor-ui-design/SKILL.md#write-for-non-technical-creators)). Timeline structure, layer names, effect boundaries, controls and feedback must explain the edit. Preserve independently meaningful editable parts. Choose continuous clips, separate segments or groups according to the human editing task; neither one clip nor more cuts is inherently better. A human must be able to identify the relevant moment and change its timing or treatment without reconstructing the agent’s reasoning.

## Guiding principles

1. **Start with the creator's task.** A capability name or renderer component is not a navigation category. Give each task one canonical home; shortcuts may lead there but must not create competing state.
2. **Keep hierarchy shallow.** One selection identity, one domain navigation row, then compact groups and controls. A group earns its heading by separating meaningful tasks. Do not repeat the selected tab as a banner, nest tab bars for disclosure, or put a border around every feature.
3. **Make the current edit legible.** Show meaningful names and current values, including animation at the playhead. Optional controls should not displace the selected task with tutorial prose. Active effects must remain discoverable. A capability being present in source code is not enough.
4. **Reuse interaction grammar.** Shared numeric, slider, keyframe, reset and action controls own behavior. A feature cannot bring its own units, diamond semantics, spacing or save model without an explicit reason and shared implementation.
5. **Consolidate as the product grows.** Each new surface records what it reuses, replaces or removes. Do not solve every discovery problem with another title, tab, button or help panel.
6. **Preserve authority and reversibility.** Selection, workspace layout and help do not edit media. Display, preview and commit address the same resolved item and clock. Reset, remove, disable, regenerate and undo have distinct meanings.
7. **Judge the assembled surface.** Review the panel with neighboring features, representative selections and both layouts. A screenshot of one new control is insufficient evidence of cohesive integration.

## Avoid session-specific shortcuts

Before adding a persistent control, name the reusable editing task it serves and check whether existing controls already cover it. A request about one section of one project does not justify a permanent shortcut with an arbitrary duration or position. Prefer improving the general range, zoom, selection or navigation controls. Record redundant controls removed in the UI audit.

**Anti-example — rhythm viewer “Last 10s”:** added to inspect three ending hits in a particular soundtrack. It introduced a fixed ten-second choice alongside Start, End, zoom and Fit, even though those controls already express any time range. The creator questioned its purpose; it was removed. An audit should flag arbitrary session-derived shortcuts and require a reusable task plus evidence of need before adding one.

Detection-based tools must provide an explicit manual correction when detection can miss user-chosen events. Show the target and time, preview the draft, and preserve apply/discard semantics. Increasing sensitivity alone cannot recover every missed event.

## Fresh-eyes acceptance check

For new or materially reorganized editing interactions, test an outcome with a person unfamiliar with the implementation or a fresh agent with no inherited project/code/conversation context. The agent is a usability proxy, not proof that human usability is solved.

### Placement audit is a separate gate

Before testing task completion, ask the visual-only reviewer where they expect each task to live based on the visible names. Compare that expectation with the actual tab, section and selected state. Inspect switching tabs after selecting a keyframe. A control must respect its visible category; a global contextual panel must not inject unrelated controls beneath Layout, Style or another tab. Entry/exit streak blur belongs with Animation. Explain category conflicts as findings and correct them before acceptance. Being able to locate and operate a misplaced control does not pass this gate. Record placement and task-completion results separately; both must pass for the reviewed interaction.

- Supply only the starting editor view, a plain-language outcome, and the product's own labels and inline hints. For example: “Make the left exit happen later and reduce its streak, then undo both changes.” Do not supply control names, click paths, source code, internal IDs or the implementer’s explanation.
- Use a disposable copy or fixture. The tester may operate visible UI and read its visible labels/accessibility text. No filesystem, source inspection, hidden application state, APIs, console scripts or assistance from the implementing agent. Tool-operation instructions and safety constraints are allowed; product-navigation hints are not.
- Observe whether the tester independently identifies the right item and moment, finds the controls, makes the requested change, sees its result and restores the prior state through Undo. Record the path taken, wrong turns, requests for help, outcome and evidence. A screenshot alone cannot establish successful interaction.
- Pass only when the task is completed and undone without implementation hints or hidden access. Needing AI to explain the UI, editing the wrong item, or being unable to locate the effect is a product failure. If the tester is blocked, record the blocker, improve the interface and rerun with a fresh tester/context; coaching the same attempt does not convert it into a pass.
- One committed change must require one Undo. The tester must be able to describe the selected item, the control's meaning and the observed result from the visible interface. Record remaining friction even on a pass; scope acceptance to the exercised task, not the whole editor.
- If this check cannot run, record **unverified** and the reason. Structural CI checks and an author’s walkthrough cannot substitute for it. Keep broader claims proportional to the tasks and selections actually tested.

## Required feature review record

For UI changes, the PR or local audit records:

- User task and exact UI path; affected selections and unavailable states.
- Existing controls reused/replaced; added visible complexity and why it is needed.
- State owner, units/range, keyframes, commit/cancel, reset and undo.
- Before/after evidence in tall and wide layouts, narrow panel and keyboard checks; explicitly untested cases.
- Automated checks and remaining failures, with baseline attribution when available.
- Fresh-eyes task, tester context, observed outcome and evidence; pass/fail/unverified and any hints required.

No second permission step is introduced. Complete authorized implementation and review; unresolved design choices with significant scope may be staged in the audit. Do not claim a redesign complete when only an audit exists.

## Enforcement and its limits

`InspectorSection` requires a typed stable `sectionId`. The registry in `inspector-sections.ts` routes it to a domain independently of the display title. `pnpm check:editor-ui` checks registered/mounted correspondence, single-domain routing, and known selection cases. It runs in PR CI and its tests also run under `pnpm test`. Missing or unknown IDs fail typecheck or the structural gate instead of silently hiding the new section.

This gate covers the shared media Properties sections, not every caption control, drawer or legacy horizontal branch. It does not measure aesthetics, accessibility, input behavior or pixel output. Those require the review record, browser evidence and relevant behavioral/render checks. Extend enforcement at the owning shared primitive as additional surfaces migrate; do not invent passing static assertions for a visual judgment.

Use the [shared editor controls](editor-controls.md) for the current component contract.

## Model, controller and view ownership

Use the [application layering architecture](../architecture/application-layering.md)
when adding or changing editor capabilities. Keep domain calculations and invariants
pure; controllers own async commands, cancellation and persistence; views render
state and delegate actions; media/storage adapters report facts. A component being
named a hook or controller does not itself establish separation.

Review changed work for duplicated derived state, request assembly inside view
handlers, resource lifetimes tied to drawer visibility, and multiple owners of
playback time. Timing changes additionally follow the playback reliability contract.
Existing mixed modules should be improved in bounded steps with behavior evidence;
this standard does not claim they have all been migrated.
