/** Walk only explicit, older revision links. Missing links and cycles fail closed. */
export function proposalRevisionAncestors<T extends { proposal_id: string; created_at: string; supersedes_proposal_ids: readonly string[] }>(entries: readonly T[], rootId: string): T[] {
  const byId = new Map(entries.map(entry => [entry.proposal_id, entry]));
  const seen = new Set([rootId]);
  const result: T[] = [];
  const visit = (id: string) => {
    const entry = byId.get(id);
    if (!entry) return;
    for (const previousId of entry.supersedes_proposal_ids) {
      const previous = byId.get(previousId);
      if (!previous || seen.has(previousId) || previous.created_at >= entry.created_at) continue;
      seen.add(previousId);
      result.push(previous);
      visit(previousId);
    }
  };
  visit(rootId);
  return result;
}

/** Review-inbox presentation only. Never resolves or rewrites proposal records. */
export function proposalRevisionPresentation<T extends {
  proposal_id: string;
  created_at: string;
  status: string;
  stale: boolean;
  summary: string;
  supersedes_proposal_ids: readonly string[];
}>(entries: T[]) {
  const byId = new Map(entries.map((entry) => [entry.proposal_id, entry]));
  const replacements = new Map<string, string>();
  const approvedReplacements = new Map<string, string>();
  for (const entry of [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.proposal_id.localeCompare(b.proposal_id))) {
    if (entry.status === "approved") {
      for (const previous of proposalRevisionAncestors(entries, entry.proposal_id)) {
        if (previous.status !== "approved") approvedReplacements.set(previous.proposal_id, entry.proposal_id);
      }
    }
    if (entry.status !== "pending") continue;
    for (const id of entry.supersedes_proposal_ids) {
      const previous = byId.get(id);
      if (!previous || previous.status !== "pending" || previous.created_at >= entry.created_at) continue;
      // A broken replacement never brings back an earlier draft that is broken too: the
      // creator sees one card to repair. A still-working earlier draft stays usable.
      if (entry.stale && !previous.stale) continue;
      replacements.set(id, entry.proposal_id);
    }
  }
  return entries.map((entry) => ({
    ...entry,
    replaced_by_pending_proposal_id: replacements.get(entry.proposal_id) ?? null,
    replaced_by_approved_proposal_id: approvedReplacements.get(entry.proposal_id) ?? null,
    previous_drafts: proposalRevisionAncestors(entries, entry.proposal_id).map(previous => ({ proposal_id: previous.proposal_id, summary: previous.summary })),
  }));
}
