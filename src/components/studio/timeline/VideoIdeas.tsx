"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { emptyVideoIdea, ideaInput, ideaStatuses, type VideoIdea, type VideoIdeaInput } from "@/lib/video-ideas";
import styles from "./VideoIdeas.module.css";
import { OptionSelect } from "@/components/ui/select";

const endpoint = "/api/user/video-ideas";
export function VideoIdeas() {
  const heading = useRef<HTMLHeadingElement>(null);
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Active");
  const [draft, setDraft] = useState<VideoIdeaInput | null>(null);
  const [editing, setEditing] = useState<VideoIdea | null>(null);
  const [undo, setUndo] = useState<{ previous: VideoIdeaInput; current: VideoIdea } | null>(null);
  const [failedMedia, setFailedMedia] = useState<string[]>([]);

  useEffect(() => {
    if (notice && !draft) heading.current?.focus();
  }, [notice, draft]);

  useEffect(() => {
    const abort = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load video ideas. Reload to try again.");
      const data = await response.json();
      setIdeas(data.ideas);
      setWarning(data.unavailable.length ? `${data.unavailable.length} saved idea record(s) could not be read.` : "");
    }).catch(err => { if (!abort.signal.aborted) setError(String(err)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  async function persist(input: VideoIdeaInput, existing: VideoIdea | null) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: input, ...(existing ? { existing: { id: existing.id, expected_revision: existing.revision } } : {}) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const saved = data.idea as VideoIdea;
    setIdeas(items => [saved, ...items.filter(item => item.id !== saved.id)]);
    return saved;
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const saved = await persist({ ...draft, tags: [...new Set(draft.tags.map(tag => tag.trim()).filter(Boolean))] }, editing);
      setUndo(editing ? { previous: ideaInput(editing), current: saved } : null);
      setNotice(editing ? "Changes saved." : "Idea saved.");
      setDraft(null); setEditing(null); setQuery("");
      setFilter(saved.status === "Archived" ? "Archived" : "Active");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function undoSave() {
    if (!undo || busy) return;
    setBusy(true); setError("");
    try {
      const restored = await persist(undo.previous, undo.current);
      setUndo(null); setNotice("Changes undone."); setFilter(restored.status === "Archived" ? "Archived" : "Active");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const visible = ideas.filter(idea => (filter === "All" || filter === "Active" ? filter === "All" || idea.status !== "Archived" : idea.status === filter)
    && [idea.title, idea.concept, idea.credit, ...idea.tags].join(" ").toLowerCase().includes(query.toLowerCase()));
  function update<K extends keyof VideoIdeaInput>(key: K, value: VideoIdeaInput[K]) { setDraft(current => current && { ...current, [key]: value }); }
  return <section className={`memory-page-column ${styles.root}`} aria-label="Video ideas">
    <div className={styles.intro}>
      <div className="memory-section-intro"><h2 ref={heading} tabIndex={-1}>Video ideas</h2></div>
      {!draft && <button type="button" disabled={loading} onClick={() => { setDraft({ ...emptyVideoIdea }); setEditing(null); setError(""); setNotice(""); }}>Add idea</button>}
    </div>
    {error && !draft && <p role="alert">{error}</p>}
    {warning && <p role="status">{warning}</p>}
    {notice && <div className={styles.actions}><p role="status">{notice}</p>{undo && !draft && <button type="button" disabled={busy} onClick={() => void undoSave()}>Undo changes</button>}</div>}
    {draft ? <form className={`memory-card ${styles.form}`} onSubmit={event => { event.preventDefault(); void save(); }}>
      <h3>{editing ? "Edit idea" : "New idea"}</h3>
      <fieldset disabled={busy}>
        <label>Title<Input autoFocus required maxLength={160} value={draft.title} onChange={e => update("title", e.target.value)} placeholder="A hook or story worth trying" /></label>
        <label>Concept<textarea maxLength={10000} value={draft.concept} onChange={e => update("concept", e.target.value)} placeholder="What happens, and what makes it work?" /></label>
        <div className={styles.columns}>
          <label>Reference URL<Input type="url" maxLength={2000} value={draft.source_url} onChange={e => update("source_url", e.target.value)} placeholder="https://…" /></label>
          <label>Creator / credit<Input maxLength={500} value={draft.credit} onChange={e => update("credit", e.target.value)} /></label>
        </div>
        <div className={styles.columns}>
          <label>What to film or capture<textarea maxLength={10000} value={draft.capture_notes} onChange={e => update("capture_notes", e.target.value)} placeholder="Footage, performance, screen recordings, or props needed" /></label>
          <label>What to edit<textarea maxLength={10000} value={draft.edit_notes} onChange={e => update("edit_notes", e.target.value)} placeholder="Sequence, effects, timing, and sound" /></label>
        </div>
        <div className={styles.columns}>
          <label>Tags (comma separated)<Input value={draft.tags.join(",")} onChange={e => update("tags", e.target.value.split(","))} /></label>
          <label>Status<OptionSelect label="Status" value={draft.status} onValueChange={next => update("status", next as VideoIdeaInput["status"])} options={ideaStatuses.map(status => ({ value: status, label: status }))} /></label>
        </div>
        <details><summary>Related effects and projects</summary>
          {draft.links.map((link, index) => <div className={styles.columns} key={index}>
            <label>Link name<Input required maxLength={160} value={link.title} onChange={e => update("links", draft.links.map((entry, i) => i === index ? { ...entry, title: e.target.value } : entry))} /></label>
            <label>Link URL<Input required type="url" value={link.url} onChange={e => update("links", draft.links.map((entry, i) => i === index ? { ...entry, url: e.target.value } : entry))} /></label>
            <button type="button" onClick={() => update("links", draft.links.filter((_, i) => i !== index))}>Remove link {index + 1}</button>
          </div>)}
          <button type="button" disabled={draft.links.length >= 30} onClick={() => update("links", [...draft.links, { title: "", url: "" }])}>Add related link</button>
        </details>
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}><button type="submit">{busy ? "Saving…" : "Save idea"}</button><button type="button" onClick={() => { setDraft(null); setEditing(null); setError(""); }}>Cancel</button></div>
      </fieldset>
    </form> : <>
      <div className={styles.filters}>
        <label>Search ideas<Input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, concept, creator, or tag" /></label>
        <label>Show<OptionSelect label="Show" value={filter} onValueChange={setFilter} options={["Active", "All", ...ideaStatuses].map(status => ({ value: status, label: status }))} /></label>
      </div>
      {loading ? <p role="status">Loading ideas…</p> : !visible.length ? <div className="memory-card"><h3>{ideas.length ? "No matching ideas" : "No ideas yet"}</h3></div> : visible.map(idea => <article className={`memory-card ${styles.idea}`} key={idea.id} aria-label={idea.title}>
        {idea.reference && <div className={styles.media}>
          <video controls playsInline preload="metadata" aria-label={`Reference: ${idea.title}`} src={`${endpoint}/${idea.id}/media`} poster={idea.poster ? `${endpoint}/${idea.id}/media?kind=poster` : undefined} onError={() => setFailedMedia(ids => ids.includes(idea.id) ? ids : [...ids, idea.id])} />
          {failedMedia.includes(idea.id) && <p role="status">Local reference unavailable</p>}
        </div>}
        <div className={styles.content}>
          <div className={styles.heading}><h3>{idea.title}</h3><span className={styles.badge}>{idea.status}</span></div>
          <p className={styles.prose}>{idea.concept || "No concept notes yet."}</p>
          {idea.tags.length > 0 && <p className={styles.muted}>{idea.tags.join(" · ")}</p>}
          <div className={styles.actions}>{idea.source_url && <a href={idea.source_url} target="_blank" rel="noreferrer">Original reference ↗</a>}<span className={styles.muted}>{idea.credit}</span></div>
          {!idea.reference && <p className={styles.muted}>{idea.source_url ? "Link saved · video not downloaded" : "Notes only"}</p>}
          <div className={styles.notes}><div><h4>What to film or capture</h4><p className={styles.prose}>{idea.capture_notes || "No capture needs recorded yet."}</p></div><div><h4>What to edit</h4><p className={styles.prose}>{idea.edit_notes || "No editing notes yet."}</p></div></div>
          {idea.links.length > 0 && <details><summary>Related effects and projects</summary><ul>{idea.links.map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noreferrer">{link.title} ↗</a></li>)}</ul></details>}
          <button type="button" onClick={() => { setEditing(idea); setDraft(ideaInput(idea)); setError(""); setNotice(""); }}>Edit idea</button>
        </div>
      </article>)}
    </>}
  </section>;
}
