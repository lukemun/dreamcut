/**
 * Per-computer editor text size. The choice scales the shared UI text tokens in
 * globals.css (`--ui-text-step`) through `data-editor-text-size` on <html>. It never
 * reaches rendered video, captions, preview canvases or exports.
 */
export const EDITOR_TEXT_SIZES = ["standard", "large", "larger"] as const;
export type EditorTextSize = (typeof EDITOR_TEXT_SIZES)[number];
export const EDITOR_TEXT_SIZE_STORAGE_KEY = "dreamcut.textSize";
export const EDITOR_TEXT_SIZE_LABELS: Record<EditorTextSize, string> = { standard: "Standard", large: "Large", larger: "Larger" };

export function parseEditorTextSize(value: unknown): EditorTextSize {
  return typeof value === "string" && (EDITOR_TEXT_SIZES as readonly string[]).includes(value) ? value as EditorTextSize : "standard";
}

export function readEditorTextSize(storage: Pick<Storage, "getItem"> | null | undefined): EditorTextSize {
  try { return parseEditorTextSize(storage?.getItem(EDITOR_TEXT_SIZE_STORAGE_KEY)); } catch { return "standard"; }
}

export function writeEditorTextSize(storage: Pick<Storage, "setItem"> | null | undefined, size: EditorTextSize): boolean {
  try { storage?.setItem(EDITOR_TEXT_SIZE_STORAGE_KEY, size); return Boolean(storage); } catch { return false; }
}

export function applyEditorTextSize(size: EditorTextSize, root: Pick<HTMLElement, "dataset">) {
  root.dataset.editorTextSize = parseEditorTextSize(size);
}

/** First-paint bootstrap for layout.tsx; mirrors readEditorTextSize + applyEditorTextSize. */
export const EDITOR_TEXT_SIZE_BOOT_SCRIPT = `(function(){var s="standard";try{var v=localStorage.getItem("${EDITOR_TEXT_SIZE_STORAGE_KEY}");if(${EDITOR_TEXT_SIZES.map(size => `v==="${size}"`).join("||")})s=v}catch(e){}document.documentElement.dataset.editorTextSize=s})()`;
