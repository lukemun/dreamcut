import assert from "node:assert/strict";
import test from "node:test";
import {
  ariaKeyShortcut, bindingMatches, DEFAULT_KEYBOARD_SHORTCUTS, OFF, parseKeyboardShortcuts, SHORTCUT_COMMAND_IDS,
  shortcutConflict, shortcutFromKeyEvent, shortcutLabel, validateKeyboardShortcuts,
} from "./keyboard-shortcuts";

const keyEvent = (key: string, overrides: Record<string, unknown> = {}) => ({ key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...overrides }) as KeyboardEvent;

test("every editor command has a default, and the defaults do not clash", () => {
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS.library, "L");
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS.proposals, "P");
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS.undo, "Mod+Z");
  for (const id of SHORTCUT_COMMAND_IDS) assert.equal(shortcutConflict(DEFAULT_KEYBOARD_SHORTCUTS, id, DEFAULT_KEYBOARD_SHORTCUTS[id]), null, id);
  // Replay and the Review drawer's Play share R by design: the drawer owns it while open.
  assert.equal(DEFAULT_KEYBOARD_SHORTCUTS.replay, DEFAULT_KEYBOARD_SHORTCUTS.reviewPlay);
});

test("a key press spells its binding, with Command and Control as one modifier", () => {
  assert.equal(shortcutFromKeyEvent(keyEvent("g")), "G");
  assert.equal(shortcutFromKeyEvent(keyEvent("Z", { shiftKey: true })), "Shift+Z");
  assert.equal(shortcutFromKeyEvent(keyEvent("z", { metaKey: true, shiftKey: true })), "Mod+Shift+Z");
  assert.equal(shortcutFromKeyEvent(keyEvent("z", { ctrlKey: true })), "Mod+Z");
  assert.equal(shortcutFromKeyEvent(keyEvent(" ")), "Space");
  assert.equal(shortcutFromKeyEvent(keyEvent("Delete")), "Backspace");
  assert.equal(shortcutFromKeyEvent(keyEvent("Shift", { shiftKey: true })), null);
  for (const fixed of ["Escape", "Tab", "Enter", "1", "9"]) assert.equal(shortcutFromKeyEvent(keyEvent(fixed)), null, fixed);
  assert.equal(bindingMatches(keyEvent("g", { shiftKey: true }), "G"), false);
  assert.equal(bindingMatches(keyEvent("g"), OFF), false);
});

test("labels follow the platform and aria names follow WAI-ARIA", () => {
  assert.equal(shortcutLabel("Mod+Shift+Z", true), "⇧⌘Z");
  assert.equal(shortcutLabel("Mod+Shift+Z", false), "Ctrl+Shift+Z");
  assert.equal(shortcutLabel("ArrowLeft", true), "←");
  assert.equal(ariaKeyShortcut("Mod+Z", true), "Meta+Z");
  assert.equal(ariaKeyShortcut(OFF), undefined);
});

test("saved settings keep valid keys, read the old drawer-only file and never fire two commands", () => {
  assert.equal(parseKeyboardShortcuts({ library: "G", proposals: "O" }).library, "G");
  assert.equal(parseKeyboardShortcuts({ split: "Escape" }).split, "S");
  const clashing = parseKeyboardShortcuts({ library: "S" });
  assert.equal(new Set(SHORTCUT_COMMAND_IDS.map(id => clashing[id]).filter(binding => binding !== OFF && binding !== "R")).size,
    SHORTCUT_COMMAND_IDS.filter(id => clashing[id] !== OFF && clashing[id] !== "R").length);
  assert.throws(() => validateKeyboardShortcuts({ library: "S" }), /different keys/);
  assert.throws(() => validateKeyboardShortcuts({ library: "Tab" }));
  assert.deepEqual(validateKeyboardShortcuts({ library: OFF, split: "Mod+K" }), { ...DEFAULT_KEYBOARD_SHORTCUTS, library: OFF, split: "Mod+K" });
});
