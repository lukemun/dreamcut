"use client";

import { useState } from "react";
import type { feedbackCoverage } from "@/lib/timeline/editing-feedback";

type Coverage = ReturnType<typeof feedbackCoverage>;
const provenanceLabel = (value: string) => value === "user_words" ? "User wording"
  : value === "inferred_reasoning" ? "Agent inference"
    : value === "unknown" ? "Authorship unknown" : "Agent summary";

export function EditingDirections({ projectId, feedback, onSaved }: {
  projectId: string; feedback: Coverage; onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [direction, setDirection] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  function start(id: string) {
    const previous = feedback.directions.find(item => item.id === id);
    setEditing(id); setDirection(previous?.direction ?? ""); setReason(previous?.reason ?? "");
    setRequestId(crypto.randomUUID()); setError("");
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const previous = feedback.directions.find(item => item.id === editing);
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/memory/feedback`, {
        method: "POST", headers: { "content-type": "application/json", "x-dreamcut-client": "editor" },
        body: JSON.stringify({ session_id: "memory-ui", turn_id: requestId, direction,
          ...(reason.trim() ? { reason } : {}), provenance: "user_words",
          ...(previous ? { supersedes_event_id: previous.id, targets: previous.targets } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save direction");
      setEditing(null); await onSaved();
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }

  return <section className="memory-card" aria-labelledby="editing-directions-title">
    <div className="memory-row"><h3 id="editing-directions-title">Your direction</h3></div>
    <p>{feedback.unaccounted_feedback_ids.length} recorded direction{feedback.unaccounted_feedback_ids.length === 1 ? " has" : "s have"} no recorded response.</p>
    {!feedback.directions.length && <p>No directions yet.</p>}
    <button type="button" disabled={busy} onClick={() => start("new")}>Add direction</button>
    {feedback.directions.slice().reverse().map(item => <article className="memory-card" key={item.id}>
      <div className="memory-eyebrow">{provenanceLabel(item.provenance)} · {item.recorded_by === "human" ? "Entered in editor" : "Recorded by agent"}
        {item.superseded_by.length ? " · Superseded" : !item.accounted_for ? " · No response recorded" : ""}</div>
      <p>{item.direction}</p><p>{item.reason ? `Reason: ${item.reason}` : "No reason recorded."}</p>
      {item.disposition && item.disposition !== "superseded" && <p>Agent reported: {item.disposition}. {item.disposition_reason}</p>}
      {!!item.proposals.length && <ul className="memory-decisions">{item.proposals.map(proposal => <li key={proposal.id}><span className="memory-status" data-status={proposal.status}>{proposal.status}</span><span>{proposal.summary}</span></li>)}</ul>}
      {!!item.changes.length && <details><summary>Saved changes and reversals · {item.changes.length}</summary>
        {item.changes.map(change => <p key={change.id}>{change.operation}{change.restores_snapshot_id ? " · Restores an earlier saved state" : ""}</p>)}
      </details>}
      {item.supersedes_event_id && <p>Corrects an earlier direction</p>}
      {!item.superseded_by.length && <button type="button" disabled={busy} onClick={() => start(item.id)}>Correct wording</button>}
    </article>)}
    {editing !== null && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Direction<textarea autoFocus required maxLength={2000} value={direction} disabled={busy} onChange={event => { setDirection(event.target.value); setRequestId(crypto.randomUUID()); }} /></label>
      <label>Reason (optional)<textarea maxLength={2000} value={reason} disabled={busy} onChange={event => { setReason(event.target.value); setRequestId(crypto.randomUUID()); }} /></label>
      <div className="memory-row"><button disabled={busy || !direction.trim()}>Save direction</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
