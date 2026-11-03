/**
 * Every editor command that has a keyboard shortcut, its default key and its group in Settings.
 * Handlers read the creator's binding from here (useKeyboardShortcuts), so a key changed in
 * Settings → Keyboard shortcuts changes the handler, the tooltip and the key hint together.
 * In-control keys (arrows in fields, Enter, Escape, Tab) follow platform convention and stay fixed.
 */
export const OFF = "Off";
export type KeyBinding = string;

export const SHORTCUT_GROUPS = ["Playback", "Editing", "Proposals", "Library"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export const SHORTCUT_COMMANDS = {
  playPause: { label: "Play or pause", group: "Playback", default: "Space" },
  playFromStart: { label: "Play from start", group: "Playback", default: "Shift+Space" },
  replay: { label: "Replay", group: "Playback", default: "R" },
  frameBack: { label: "Back one frame", group: "Playback", default: "ArrowLeft" },
  frameForward: { label: "Forward one frame", group: "Playback", default: "ArrowRight" },
  undo: { label: "Undo", group: "Editing", default: "Mod+Z" },
  redo: { label: "Redo", group: "Editing", default: "Mod+Shift+Z" },
  mark: { label: "Add a mark", group: "Editing", default: "M" },
  snap: { label: "Snapping", group: "Editing", default: "N" },
  split: { label: "Split at playhead", group: "Editing", default: "S" },
  selectPrevious: { label: "Select previous", group: "Editing", default: "[" },
  selectNext: { label: "Select next", group: "Editing", default: "]" },
  fitTimeline: { label: "Fit timeline", group: "Editing", default: "Shift+Z" },
  delete: { label: "Delete selection", group: "Editing", default: "Backspace" },
  proposals: { label: "Open or close Proposals", group: "Proposals", default: "P" },
  apply: { label: "Apply", group: "Proposals", default: "A" },
  applyAll: { label: "Apply all selected", group: "Proposals", default: "Shift+A" },
  reject: { label: "Reject", group: "Proposals", default: "X" },
  reviewPlay: { label: "Play proposal", group: "Proposals", default: "R" },
  compareOriginal: { label: "Original or proposal", group: "Proposals", default: "B" },
  library: { label: "Open or close Library", group: "Library", default: "L" },
} as const satisfies Record<string, { label: string; group: ShortcutGroup; default: KeyBinding }>;

export type ShortcutCommand = keyof typeof SHORTCUT_COMMANDS;
export type KeyboardShortcuts = Record<ShortcutCommand, KeyBinding>;
export const SHORTCUT_COMMAND_IDS = Object.keys(SHORTCUT_COMMANDS) as ShortcutCommand[];
export const DEFAULT_KEYBOARD_SHORTCUTS = Object.fromEntries(
  SHORTCUT_COMMAND_IDS.map(id => [id, SHORTCUT_COMMANDS[id].default]),
) as KeyboardShortcuts;

/** Shown in Settings but not rebindable: a range of keys, or a key every dialog relies on. */
export const FIXED_SHORTCUTS: { keys: string; label: string; group: ShortcutGroup }[] = [
  { keys: "1–9", label: "Tick an option", group: "Proposals" },
  { keys: "Esc", label: "Close Proposals or Library", group: "Library" },
];

// Replay and the Review drawer's Play are one key in two places: the drawer owns R while it is open.
const MAY_SHARE: [ShortcutCommand, ShortcutCommand][] = [["replay", "reviewPlay"]];
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock", "Fn"]);
const FIXED_KEYS = new Set(["Escape", "Tab", "Enter", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export const KEYBOARD_SHORTCUT_STORAGE_KEY = "dreamcut.keyboard-shortcuts.v1";
export const KEYBOARD_SHORTCUT_EVENT = "dreamcut:keyboard-shortcuts-change";

type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The binding a key press spells, e.g. "Mod+Shift+Z"; null for a lone modifier or a fixed key. */
export function shortcutFromKeyEvent(event: KeyLike): KeyBinding | null {
  const key = event.key === " " ? "Space" : event.key === "Delete" ? "Backspace" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!key || key === "Unidentified" || key === "Dead" || MODIFIER_KEYS.has(key)) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (!mod && !event.altKey && FIXED_KEYS.has(key)) return null;
  return [mod && "Mod", event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
}

/** The key press is this binding. Handlers keep their own focus and state rules. */
export function bindingMatches(event: KeyLike, binding: KeyBinding): boolean {
  return binding !== OFF && shortcutFromKeyEvent(event) === binding;
}

/** A drawer-style shortcut: one press, never while typing in a field or behind a modal dialog. */
export function matchesShortcut(event: KeyboardEvent, binding: KeyBinding): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat || !bindingMatches(event, binding)) return false;
  const target = event.target;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (target.isContentEditable
    || target.closest('input, textarea, select, [role="textbox"], [role="dialog"][aria-modal="true"]'))) return false;
  if (typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  return true;
}

export const isMacPlatform = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEY_NAMES: Record<string, string> = { Space: "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Backspace: "⌫" };

/** "Mod+Shift+Z" → "⇧⌘Z" on a Mac, "Ctrl+Shift+Z" elsewhere. */
export function shortcutLabel(binding: KeyBinding, mac = isMacPlatform()): string {
  if (binding === OFF) return OFF;
  const parts = binding.split("+");
  const key = parts.pop()!;
  const name = KEY_NAMES[key] ?? key;
  if (mac) return [parts.includes("Alt") && "⌥", parts.includes("Shift") && "⇧", parts.includes("Mod") && "⌘", name].filter(Boolean).join("");
  return [parts.includes("Mod") && "Ctrl", parts.includes("Alt") && "Alt", parts.includes("Shift") && "Shift", name].filter(Boolean).join("+");
}

/** The aria-keyshortcuts value for a binding (WAI-ARIA names), or undefined when it is off. */
export function ariaKeyShortcut(binding: KeyBinding, mac = isMacPlatform()): string | undefined {
  if (binding === OFF) return undefined;
  return binding.split("+").map(part => part === "Mod" ? (mac ? "Meta" : "Control") : part).join("+");
}

function validBinding(value: unknown): value is KeyBinding {
  if (value === OFF) return true;
  if (typeof value !== "string" || value.length > 40) return false;
  const match = value.match(/^(Mod\+)?(Alt\+)?(Shift\+)?(.+)$/);
  const key = match?.[4];
  return Boolean(key && !key.includes("+") || key === "+") && !MODIFIER_KEYS.has(key!)
    && (Boolean(match?.[1] || match?.[2]) || !FIXED_KEYS.has(key!));
}

/** The other command already using this binding, if any. */
export function shortcutConflict(shortcuts: KeyboardShortcuts, command: ShortcutCommand, binding: KeyBinding): ShortcutCommand | null {
  if (binding === OFF) return null;
  return SHORTCUT_COMMAND_IDS.find(other => other !== command && shortcuts[other] === binding
    && !MAY_SHARE.some(pair => pair.includes(command) && pair.includes(other))) ?? null;
}

/** Saved settings, falling back to the default for anything unreadable; also reads the old drawer-only file. */
export function parseKeyboardShortcuts(value: unknown): KeyboardShortcuts {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const shortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  for (const id of SHORTCUT_COMMAND_IDS) if (validBinding(record[id])) shortcuts[id] = record[id];
  // A clash in saved settings resets the later command rather than firing two actions.
  for (const id of SHORTCUT_COMMAND_IDS) if (shortcutConflict(shortcuts, id, shortcuts[id])) shortcuts[id] = DEFAULT_KEYBOARD_SHORTCUTS[id];
  for (const id of SHORTCUT_COMMAND_IDS) if (shortcutConflict(shortcuts, id, shortcuts[id])) shortcuts[id] = OFF;
  return shortcuts;
}

export function validateKeyboardShortcuts(value: unknown): KeyboardShortcuts {
  if (!value || typeof value !== "object") throw new Error("Invalid shortcut settings.");
  const record = value as Record<string, unknown>;
  const shortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  for (const id of SHORTCUT_COMMAND_IDS) {
    if (record[id] === undefined) continue;
    if (!validBinding(record[id])) throw new Error(`${SHORTCUT_COMMANDS[id].label}: choose another key or turn it off.`);
    shortcuts[id] = record[id];
  }
  for (const id of SHORTCUT_COMMAND_IDS) {
    const other = shortcutConflict(shortcuts, id, shortcuts[id]);
    if (other) throw new Error(`${SHORTCUT_COMMANDS[id].label} and ${SHORTCUT_COMMANDS[other].label} need different keys.`);
  }
  return shortcuts;
}
