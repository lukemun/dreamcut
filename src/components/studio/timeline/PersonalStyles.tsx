"use client";
import { useEffect, useState } from "react";
import type { PersonalStyle } from "@/lib/local-store/personal-styles";

function StyleEditor({ style, projectId, onSaved }: { style: PersonalStyle; projectId: string; onSaved: () => void }) {
  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description);
  const [bundles, setBundles] = useState(style.bundles);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <details className="memory-card personal-style-card"><summary>{style.name}</summary>
    <p>{style.description}</p><p className="memory-muted">Saved from {style.source_edit.title} · revision {style.revision} · local only</p>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/personal-styles`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({
          existing: { id: style.id, expected_revision: style.revision },
          style: { name, description, bundles, authorization: {kind:"explicit_request", instruction:"Save my changes from the personal style editor."} },
        }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        setMessage("Saved locally."); onSaved();
      } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
    }}>
      <label>Template name<input value={name} required maxLength={100} onChange={e=>setName(e.target.value)} /></label>
      <label>Description<textarea value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)} /></label>
      {bundles.map((bundle, index) => <fieldset key={index}><legend>{bundle.skill}</legend>
        {Object.entries(bundle.parameters).map(([key, value]) => <label key={key}>{key.replaceAll("_", " ")}
          {typeof value === "boolean" ? <input type="checkbox" checked={value} onChange={e=>setBundles(rows=>rows.map((row,i)=>i===index?{...row,parameters:{...row.parameters,[key]:e.target.checked}}:row))} />
            : <input type={typeof value === "number" ? "number" : "text"} step="any" required value={String(value)} onChange={e=>setBundles(rows=>rows.map((row,i)=>i===index?{...row,parameters:{...row.parameters,[key]:typeof value === "number" ? Number(e.target.value) : e.target.value}}:row))} />}
        </label>)}
      </fieldset>)}
      <button disabled={busy}>Save changes</button>
      <button type="button" onClick={async()=>{try {await navigator.clipboard.writeText(`Use my template "${style.name}" (id ${style.id}, revision ${style.revision}) on this footage. Read its parameters with personal_style_get, adapt timing to this footage, and prepare a proposal with personal_style pinned to that id and revision. Report any parameters you cannot preserve. Do not apply it automatically.`);setMessage("Reuse prompt copied.");} catch {setMessage("Could not copy.");}}}>Copy reuse prompt</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
export function PersonalStyles({ projectId, recipeId, onSaved }: { projectId: string; recipeId: string; onSaved?: () => void }) {
  const [styles, setStyles] = useState<PersonalStyle[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(()=>{let live=true;fetch(`/api/projects/${encodeURIComponent(projectId)}/personal-styles`).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error);if(live){setStyles(b.styles);setError("");}}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[projectId,refresh]);
  return <section className="personal-styles" aria-label="Saved template settings">
    {error && <p role="alert">{error}</p>}
    {styles.filter(style => style.id === recipeId).map(style=><StyleEditor key={`${style.id}-${style.revision}`} style={style} projectId={projectId} onSaved={()=>{setRefresh(n=>n+1);onSaved?.();}} />)}
  </section>;
}
