/** Asks the Library page to open its Generate drawer (detail.pane: "create" | "history"). */
export const OPEN_GENERATE_EVENT = "dreamcut:open-generate";
export type GeneratePane = "create" | "history";
/** `?generate=create|results` on the Library URL opens the drawer on that pane. */
export function generatePaneFromParam(value: string | null): GeneratePane | null {
  return value === "results" || value === "history" ? "history" : value ? "create" : null;
}
