/** Local style writers announce a change; cloud style sync (when loaded and signed in) pushes it soon.
 * A global slot keeps one listener across bundled copies of this module. Missed signals are harmless:
 * the periodic sync compares content hashes. */
const key = Symbol.for("dreamcut.styleChanged");
type Shared = typeof globalThis & { [key]?: () => void };

export function onLocalStyleChanged(listener: (() => void) | undefined) { (globalThis as Shared)[key] = listener; }
export function notifyLocalStyleChanged() {
  try { (globalThis as Shared)[key]?.(); } catch { /* sync is best effort and never blocks a local save */ }
}
