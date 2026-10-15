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
  assert.match(library, /matchesPanelShortcut\(event, libraryShortcut\)/);
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

test("generation models use a single dropdown without a redundant search field", () => {
  assert.match(drawer, /aria-label="Generation model"/);
  assert.match(drawer, /<option value="gpt-image">GPT Image<\/option>/);
  assert.doesNotMatch(drawer, /aria-label="Generation route"|Generate with/);
  assert.doesNotMatch(drawer, /Search models|Find a model|modelSearch/);
  assert.match(drawer, /<DrawerHeader closeLabel=\{docked \? "Hide Generate" : "Close generation drawer"\}/);
  assert.match(drawer, /<DrawerHeaderTab/);
  assert.ok(drawer.indexOf('<GenerationPrompt') < drawer.indexOf('Images & references'));
  assert.ok(drawer.indexOf('ref={drawerBody}') < drawer.indexOf('aria-label="Generation model"'));
  assert.ok(drawer.indexOf('aria-label="Generation model"') < drawer.indexOf('<GenerationPrompt'));
});

test("the chat replaces the prompt builder and output settings start open", () => {
  // Creator direction 2026-10-09: no header help popover; the dock chat and its page
  // context are where the agent helps with the draft.
  assert.doesNotMatch(drawer, /Help with asset generation/);
  assert.match(drawer, /setPageContext\(\{ key: "generate"/);
  assert.doesNotMatch(drawer, /Help me write the prompt|Prompt writer|Build prompt|\/build-prompt/);
  // One disclosure owner for Output and Advanced settings; Output starts open.
  assert.match(drawer, /useState\(true\), \[advancedOpen, setAdvancedOpen\] = useState\(false\)/);
  assert.match(drawer, /<InspectorDisclosure title="Output settings" open=\{outputOpen\}/);
  assert.match(drawer, /<InspectorDisclosure title="Advanced settings" open=\{advancedOpen\}/);
  assert.doesNotMatch(drawer, /<details/);
});

test("Generate header names what to make; History and Back sit outside the tabs", () => {
  assert.match(drawer, /const CREATE_SECTIONS = \[\["image", "Image"\], \["video", "Video"\], \["music", "Music"\], \["motion", "Motion"\]\] as const;/);
  assert.doesNotMatch(drawer, /"Motion graphics"/);
  assert.match(drawer, /aria-label="Back to Library"/);
  // UX audit 2026-10-13: past generations are a quiet History link, not a fourth tab; History has its own way back.
  assert.match(drawer, /id="generation-history-open"[\s\S]*?>History<\/Button>/);
  assert.match(drawer, /aria-label="Back to Generate"/);
  assert.doesNotMatch(drawer, /Results\{state\?\.jobs\.length/);
  // One control per reference slot: the slot offers Library or Upload; no duplicate header Upload button.
  assert.match(drawer, />From library<\/ActionMenuItem>/);
  assert.match(drawer, />Upload<\/ActionMenuItem>/);
  assert.match(drawer, /aria-label="Upload reference"/);
  assert.doesNotMatch(drawer, /<PlusIcon size=\{13\} \/>Upload/);
  // The GPT Image button names what it does: it creates a request the creator's Codex fulfils, not a charged generation.
  assert.match(drawer, /"Create request for Codex"/);
  assert.doesNotMatch(drawer, /Prepare GPT Image request/);
  // The footer says what it costs, with a same-height placeholder while the price loads.
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
