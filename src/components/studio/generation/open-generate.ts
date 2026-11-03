/** Asks the Library page to open its Generate drawer (detail.pane: "create" | "history"). */
export const OPEN_GENERATE_EVENT = "dreamcut:open-generate";
/** The header's Library button opens or closes the Library page's Generate form. */
export const TOGGLE_GENERATE_EVENT = "dreamcut:toggle-generate";
/** The Library page reports whether Generate is open (detail.open), so the header button shows it. */
export const GENERATE_STATE_EVENT = "dreamcut:generate-state";
export type GeneratePane = "create" | "history";
/** `?generate=create|results` on the Library URL opens the drawer on that pane. */
export function generatePaneFromParam(value: string | null): GeneratePane | null {
  return value === "results" || value === "history" ? "history" : value ? "create" : null;
}
