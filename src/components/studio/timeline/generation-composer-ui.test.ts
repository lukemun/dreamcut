import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const drawer = fs.readFileSync(new URL("../generation/AssetGenerationDrawer.tsx", import.meta.url), "utf8");
const prompt = fs.readFileSync(new URL("../generation/GenerationPrompt.tsx", import.meta.url), "utf8");
const library = fs.readFileSync(new URL("./LibraryCatalog.tsx", import.meta.url), "utf8");
const shelf = fs.readFileSync(new URL("./AssetShelf.tsx", import.meta.url), "utf8");
const editor = fs.readFileSync(new URL("../TimelineStep.tsx", import.meta.url), "utf8");

test("image slots pick from the Library without hiding the form", () => {
  // Docked (Library page) and embedded forms fill a slot from their host's Library grid.
  assert.match(drawer, /onPickLibrary\?\.\(role, /);
  // Creator direction 2026-10-12: in a slide-out drawer (editor, Storyboard) the picker opens in place,
  // under the slot, titled with the slot's own label, so the form stays visible.
  assert.match(drawer, /const pickInPlace = !embedded && presentation === "drawer";/);
  assert.match(drawer, /<ReferencePicker key=\{`\$\{picking\.role\}-\$\{picking\.index \?\? "new"\}`\}/);
  assert.match(drawer, /title=\{`Choose the \$\{slotNoun\(picking\.role\)\}`\}/);
  // The Images list is picked for as "image", not by an internal role name, in place and in the host's Library.
  assert.match(drawer, /pool\?\.includes\(role\) \? "image"/);
  assert.match(drawer, /onPickLibrary\?\.\(role, slotNoun\(role\)\)/);
  assert.doesNotMatch(shelf, /Cancel reference selection/);
  assert.doesNotMatch(drawer, /Saved references|Save references|Load saved references/);
  // Library shortcuts belong to the project drawer, including on the Library page.
  const projectDrawer = fs.readFileSync(new URL("./ProjectLibraryDrawer.tsx", import.meta.url), "utf8");
  assert.match(projectDrawer, /matchesShortcut\(event, shortcut\)/);
  assert.doesNotMatch(library, /matchesShortcut/);
  // Creator direction 2026-10-12: Library docks the one Generate form beside the grid (a one-line switch to a drawer).
  assert.match(library, /const LIBRARY_GENERATE_PRESENTATION: "docked" \| "drawer" = "docked";/);
  assert.match(library, /<AssetGenerationDrawer projectId=\{projectId\} presentation=\{presentation\}/);
  assert.match(library, /<WorkspaceResizeHandle label="Resize Generate panel"/);
  assert.doesNotMatch(library, />Generate assets/);
  assert.doesNotMatch(library, /Shift\+G|KeyG/);
  assert.doesNotMatch(editor, /Shift\+G|KeyG/);
  // While Generate is open, a Library image fills the slot the form asked for, or offers the model's roles.
  assert.match(library, /onPickLibrary=\{\(role, label\) => \{ setPickingRole\(role\); setPickingLabel\(label\)/);
  assert.match(library, /addReference: true, source/);
  // The editor's Library now lives in the tool-area tab beside Properties instead of a MediaDrawer.
  assert.match(editor, /<div className="editor-tool-content" hidden=\{toolsCollapsed \|\| !shelfOpen\}>\{assetShelfNode\}<\/div>/);
  assert.match(shelf, /pickingGenerationRole/);
  assert.doesNotMatch(library, /Use selected image|Use in generation|>Refine<|>Animate</);
  assert.match(shelf, /setPickingGenerationRole\(role\)/);
  assert.match(shelf, /selectTab\(role === "motion" \|\| role === "source" \? "videos" : "stills"\)/);
});

test("the model is a chip in the prompt box that lists every model, grouped by job, with inputs and price", () => {
  // Creator direction 2026-10-22 (after comparing Higgsfield, Krea and Magnific): the model control names the model;
  // opening it lists the models with what each takes and its approximate price. Later the same day: the model sits in
  // the prompt box with the output chips, "like other ones are".
  const picker = fs.readFileSync(new URL("../generation/ModelPicker.tsx", import.meta.url), "utf8");
  assert.match(drawer, /<ModelPicker key=\{sectionOf\(draft\.task\)\} choices=\{modelChoices\}/);
  // The Codex image tool is not a DreamCut model: the picker lists DreamCut models only.
  assert.doesNotMatch(drawer, /id: "gpt-image"|route: "codex"|Codex image tool/);
  assert.match(drawer, /price: priceLine, group: modelGroup\(m\)/);
  assert.match(picker, /aria-label=\{`Model: /);
  assert.match(picker, /choice\.inputs\.join\(" · "\)/);
  // Creator direction 2026-10-22: the list is one line per model; what it is good at opens beside it from its info icon.
  assert.match(picker, /aria-label=\{`About \$\{choice\.name\}`\}/);
  assert.match(picker, /<TooltipContent side="right"/);
  assert.doesNotMatch(drawer + picker, /aria-label="Generation route"|Generate with|Search models|Find a model|modelSearch/);
  assert.match(drawer, /<DrawerHeader closeLabel=\{docked \? "Hide Generate" : "Close generation drawer"\}/);
  assert.match(drawer, /<DrawerHeaderTab/);
  // References come before the prompt so the prompt, its model, its settings and Generate read as one unit.
  assert.ok(drawer.indexOf('ref={drawerBody}') < drawer.indexOf('Images & references'));
  assert.ok(drawer.indexOf('Images & references') < drawer.indexOf('<GenerationPrompt'));
  assert.ok(drawer.indexOf('<GenerationPrompt') < drawer.indexOf('<OutputChips'));
  assert.ok(drawer.indexOf('<OutputChips') < drawer.indexOf('<ModelPicker'));
  // One row: the settings chip first, the model chip at the far right (creator direction 2026-10-22).
  const chipsSource = fs.readFileSync(new URL("../generation/OutputChips.tsx", import.meta.url), "utf8");
  assert.ok(chipsSource.indexOf('<Popover.Trigger aria-label={`Settings: ') < chipsSource.indexOf('{leading ? <div className="ml-auto shrink-0">'));
  assert.doesNotMatch(chipsSource, /flex-wrap/);
  // The prompt box resizes as a whole, so its grip sits under the chips.
  assert.match(prompt, /resize-y flex-col/);
  assert.match(prompt, /resize-none/);
});

test("output settings are one chip in the prompt box and Generate follows them", () => {
  // Creator direction 2026-10-22: the Output settings section became one row of chips; a model's own settings open
  // from its More chip; Generate and its price sit directly under the chips instead of in a pinned footer.
  const chips = fs.readFileSync(new URL("../generation/OutputChips.tsx", import.meta.url), "utf8");
  assert.match(drawer, /<OutputChips draft=\{draft\} update=\{update\} moreOpen=\{advancedOpen\}/);
  assert.match(drawer, /advancedOpen \? <ModelSettings/);
  assert.doesNotMatch(drawer, /title="Output settings"|title="Advanced settings"|<footer/);
  assert.ok(drawer.indexOf('<OutputChips') < drawer.indexOf('className={primaryAction}'));
  // Creator direction 2026-10-22: the settings fold into one chip that reads the choices and opens them as a short list.
  assert.match(chips, /aria-label="More settings" aria-expanded=\{moreOpen\}/);
  assert.match(chips, /const summary = settings\.filter/);
  assert.match(chips, /<SegmentedControl size="sm" fill role="group" aria-label=\{setting\.label\}/);
  // The balance reads as generations like this one, not only a credit count.
  assert.match(drawer, /enough for \$\{runs\.toLocaleString\(\)\} like this/);
});

test("the chat replaces the prompt builder", () => {
  // Creator direction 2026-10-09: no header help popover; the dock chat and its page
  // context are where the agent helps with the draft.
  assert.doesNotMatch(drawer, /Help with asset generation/);
  assert.match(drawer, /setPageContext\(\{ key: "generate"/);
  assert.doesNotMatch(drawer, /Help me write the prompt|Prompt writer|Build prompt|\/build-prompt/);
  assert.doesNotMatch(drawer, /<details/);
});

test("Generate header names what to make; History and Back sit outside the tabs", () => {
  assert.match(drawer, /const CREATE_SECTIONS = \[\["image", "Image"\], \["video", "Video"\], \["music", "Music"\], \["speech", "Voice"\]\] as const;/);
  // Motion graphics arrive only as proposals on the timeline (creator direction 2026-10-26).
  assert.doesNotMatch(drawer, /"Motion graphics"|MotionGraphicsSection/);
  assert.match(drawer, /aria-label="Back to Library"/);
  // UX audit 2026-10-13: past generations are not a fourth tab. Creator direction 2026-10-22: History is an icon
  // toggle beside the tabs, which stay in place, rather than a page that replaces them.
  assert.match(drawer, /id="generation-history-open"[^>]*aria-label="History"[^>]*aria-pressed=\{results\}/);
  assert.match(drawer, /<HistoryIcon aria-hidden="true" \/><\/Button>/);
  assert.doesNotMatch(drawer, /aria-label="Back to Generate"/);
  assert.doesNotMatch(drawer, /Results\{state\?\.jobs\.length/);
  // One control per reference slot: the slot offers Library or Upload; no duplicate header Upload button.
  assert.match(drawer, />From library<\/ActionMenuItem>/);
  assert.match(drawer, />Upload<\/ActionMenuItem>/);
  assert.match(drawer, /aria-label="Upload reference"/);
  assert.doesNotMatch(drawer, /<PlusIcon size=\{13\} \/>Upload/);
  // Pictures default to the best DreamCut model (creator direction 2026-10-23: no Codex image route).
  assert.match(drawer, /const defaultImageModel = \(\) => defaultModelId\("image", \[\]\)/);
  assert.doesNotMatch(drawer, /Create request for Codex/);
  // The price line says what it costs, with a same-height placeholder while the price loads.
  assert.match(drawer, /`Costs \$\{credits\(quote\.credits\)\}`/);
  assert.match(drawer, /Costs … credits/);
  assert.doesNotMatch(drawer, /Checking price|… credits`/);
});

test("reference mentions are colored without replacing native prompt editing", () => {
  assert.match(prompt, /<textarea/);
  assert.match(prompt, /aria-hidden="true"/);
  // Creator direction 2026-10-09: no explanation text; the insert button names the reference.
  assert.doesNotMatch(prompt, /asset-prompt-guidance|refers to your character/);
  assert.match(prompt, /Insert @Element1 \(character\)/);
  assert.match(prompt, /setSelectionRange/);
  assert.match(prompt, /mirror.current.scrollTop = e.currentTarget.scrollTop/);
  assert.match(prompt, /text-violet-300/);
  assert.doesNotMatch(prompt, /dangerouslySetInnerHTML|contentEditable/);
});
