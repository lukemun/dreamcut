/**
 * The editor's look: colours and edges (editor-glass.css, data-editor-palette). Studio is the default;
 * Ember is the warm pro-editor look; "chrome" is the earlier look, kept as Classic.
 * Every look ships a light and a dark palette. The dark-only trials (graphite, neon, aurora, slate)
 * were dropped and fall back to the default.
 */
export const EDITOR_LOOKS = ["studio", "ember", "chrome"] as const;
export type EditorLook = (typeof EDITOR_LOOKS)[number];
export const EDITOR_LOOK_LABELS: Record<EditorLook, string> = { studio: "Studio", ember: "Ember", chrome: "Classic" };
export const DEFAULT_EDITOR_LOOK: EditorLook = "studio";
export const EDITOR_LOOK_STORAGE_KEY = "dreamcut.palette";
/** Every value the startup script accepts from storage or ?look=. */
export const KNOWN_EDITOR_LOOKS: readonly string[] = [...EDITOR_LOOKS];

export function parseEditorLook(value: string | null | undefined): EditorLook {
  return (EDITOR_LOOKS as readonly string[]).includes(value ?? "") ? value as EditorLook : DEFAULT_EDITOR_LOOK;
}
