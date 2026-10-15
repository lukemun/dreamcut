/** Narrow trial authority; production schema validation remains authoritative for payload semantics. */
export function assertCitadellaTrialProposal(args, { projectId, revision, elementIds }) {
  if (args?.project_id !== projectId || args.proposal?.project_id !== projectId) throw new Error('Cross-project access denied');
  const p = args.proposal;
  if (p.expected_revision !== revision || p.caps?.max_renders !== 0 || p.options?.length !== 1 || p.decision !== 'propose') throw new Error('Invalid trial bounds or stale revision');
  if (!p.responds_to_feedback_ids?.length) throw new Error('Record and link the request feedback first');
  for (const op of p.options[0].operations) {
    if (!elementIds.includes(op.element_id) || Object.keys(op).some(k => !['element_id','patch','rationale'].includes(k)) || !op.patch || Object.keys(op.patch).some(k => !['timeline_start','duration'].includes(k))) throw new Error('Only task-actor timing patches are allowed');
  }
  return p;
}
