import type { InstantPreviewProp } from "./proposal-preview-props";

/**
 * Dial values being dragged on a proposal card, delivered straight to the GPU player.
 * Routing them through editor state re-rendered the whole editor per drag sample
 * (≈60 ms), which capped the paused preview at a few pictures a second. Only the
 * player subscribes; the editor's draft catches up once from the derived preview,
 * which then clears this store.
 */
export type InstantPreviewSnapshot = { proposalId: string; props: InstantPreviewProp[] };

let snapshot: InstantPreviewSnapshot | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export const instantPreviewStore = {
  get: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Merge the newest values for this card; a different card starts fresh. */
  set(proposalId: string, props: readonly InstantPreviewProp[]) {
    if (props.length === 0) return;
    const prior = snapshot?.proposalId === proposalId ? snapshot.props : [];
    const replaced = new Set(props.map((prop) => `${prop.elementId}\u0000${prop.field}`));
    snapshot = { proposalId, props: [...prior.filter((prop) => !replaced.has(`${prop.elementId}\u0000${prop.field}`)), ...props] };
    emit();
  },
  clear() {
    if (!snapshot) return;
    snapshot = null;
    emit();
  },
};
