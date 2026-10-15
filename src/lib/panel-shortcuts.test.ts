import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PANEL_SHORTCUTS, matchesPanelShortcut, parsePanelShortcuts, shortcutFromKeyEvent, validatePanelShortcuts } from "./panel-shortcuts";

const keyEvent = (key: string, overrides: Record<string, unknown> = {}) => ({ key, target: null, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, repeat: false, defaultPrevented: false, isComposing: false, ...overrides }) as unknown as KeyboardEvent;

test("drawer shortcuts default to L and P and migrate a saved Library key", () => {
  assert.deepEqual(DEFAULT_PANEL_SHORTCUTS, { library: "L", proposals: "P" });
  assert.deepEqual(parsePanelShortcuts({ library: "G" }), { library: "G", proposals: "P" });
});

test("recorded letters reject modifiers and keys owned by editing actions", () => {
  assert.equal(shortcutFromKeyEvent(keyEvent("g")), "G");
  assert.equal(shortcutFromKeyEvent(keyEvent("g", { shiftKey: true })), null);
  assert.equal(shortcutFromKeyEvent(keyEvent("r")), null);
  assert.equal(shortcutFromKeyEvent(keyEvent("1")), null);
  assert.deepEqual(validatePanelShortcuts({ library: "Off", proposals: "O" }), { library: "Off", proposals: "O" });
  assert.throws(() => validatePanelShortcuts({ library: "G", proposals: "G" }));
  assert.throws(() => validatePanelShortcuts({ library: "R", proposals: "P" }));
});

test("drawer shortcuts ignore repeats, modifiers, prevented events, and disabled bindings", () => {
  assert.equal(matchesPanelShortcut(keyEvent("g"), "G"), true);
  assert.equal(matchesPanelShortcut(keyEvent("g", { repeat: true }), "G"), false);
  assert.equal(matchesPanelShortcut(keyEvent("g", { defaultPrevented: true }), "G"), false);
  assert.equal(matchesPanelShortcut(keyEvent("g", { shiftKey: true }), "G"), false);
  assert.equal(matchesPanelShortcut(keyEvent("g"), "Off"), false);
});

test("drawer letters work after button focus while text entry keeps its keystrokes", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  class FocusedElement {
    isContentEditable = false;
    constructor(readonly tag: string) {}
    closest(selector: string) { return selector.split(", ").includes(this.tag) ? this : null; }
  }
  Object.defineProperty(globalThis, "HTMLElement", { value: FocusedElement, configurable: true });
  try {
    assert.equal(matchesPanelShortcut(keyEvent("p", { target: new FocusedElement("button") }), "P"), true);
    for (const tag of ["input", "textarea", "select"]) {
      assert.equal(matchesPanelShortcut(keyEvent("p", { target: new FocusedElement(tag) }), "P"), false, tag);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "HTMLElement", previous);
    else Reflect.deleteProperty(globalThis, "HTMLElement");
  }
});
