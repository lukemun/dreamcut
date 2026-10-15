export type PanelShortcut = string | "Off";
export type PanelShortcuts = { library: PanelShortcut; proposals: PanelShortcut };

export const DEFAULT_PANEL_SHORTCUTS: PanelShortcuts = { library: "L", proposals: "P" };
export const PANEL_SHORTCUT_STORAGE_KEY = "dreamcut.panel-shortcuts.v1";
export const PANEL_SHORTCUT_EVENT = "dreamcut:panel-shortcuts-change";

// These unmodified keys already belong to timeline and review actions.
const RESERVED_KEYS = new Set(["A", "B", "M", "N", "R", "S", "X", "Z"]);

export function parsePanelShortcut(value: unknown, fallback: PanelShortcut): PanelShortcut {
  return value === "Off" || (typeof value === "string" && /^[A-Z]$/.test(value) && !RESERVED_KEYS.has(value))
    ? value as PanelShortcut : fallback;
}

export function parsePanelShortcuts(value: unknown): PanelShortcuts {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const library = parsePanelShortcut(record.library, DEFAULT_PANEL_SHORTCUTS.library);
  const proposals = parsePanelShortcut(record.proposals, DEFAULT_PANEL_SHORTCUTS.proposals);
  return library !== "Off" && library === proposals ? DEFAULT_PANEL_SHORTCUTS : { library, proposals };
}

export function validatePanelShortcuts(value: unknown): PanelShortcuts {
  if (!value || typeof value !== "object") throw new Error("Invalid shortcut settings.");
  const record = value as Record<string, unknown>;
  const library = parsePanelShortcut(record.library, "");
  const proposals = parsePanelShortcut(record.proposals, "");
  if (!library || !proposals) throw new Error("Choose a single unused letter or turn the shortcut off.");
  if (library !== "Off" && library === proposals) throw new Error("Library and Proposals need different keys.");
  return { library, proposals };
}

export function shortcutFromKeyEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): PanelShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  const key = event.key.toUpperCase();
  return /^[A-Z]$/.test(key) && !RESERVED_KEYS.has(key) ? key : null;
}

export function matchesPanelShortcut(event: KeyboardEvent, shortcut: PanelShortcut): boolean {
  if (shortcut === "Off" || event.defaultPrevented || event.isComposing || event.repeat || shortcutFromKeyEvent(event) !== shortcut) return false;
  const target = event.target;
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (target.isContentEditable
    || target.closest('input, textarea, select, [role="textbox"], [role="dialog"][aria-modal="true"]'))) return false;
  if (typeof document !== "undefined" && document.querySelector('[role="dialog"][aria-modal="true"]')) return false;
  return true;
}
