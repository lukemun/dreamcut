"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "./EditingMemory.module.css";

type Document = { markdown: string; revision: string };
/** Readable document presentation; raw HTML and links never execute. */
function DocumentText({ text }: { text: string }) {
  const lines = text.split("\n");
  return <div className={styles.styleDocument}>{lines.map((line, index) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      if (level === 1 && heading[2] === "My style") return null;
      let hasContent = false;
      for (let i = index + 1; i < lines.length; i++) {
        const next = /^(#{1,6})\s+/.exec(lines[i]!);
        if (next && next[1]!.length <= level) break;
        if (lines[i]!.trim() && !next) { hasContent = true; break; }
      }
      if (!hasContent) return null;
      return level <= 2 ? <h3 key={index}>{heading[2]}</h3> : <h4 key={index}>{heading[2]}</h4>;
    }
    return line.trim() ? <p key={index}>{line}</p> : null;
  })}</div>;
}
export function StyleDocumentEditor({ document, save, busy, onDirty }: { document: Document; save: (markdown: string, revision: string) => Promise<boolean>; busy: boolean; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(document.markdown);
  const [base, setBase] = useState(document);
  const [editing, setEditing] = useState(false);
  const [undo, setUndo] = useState<{ markdown: string; revision: string } | null>(null);
  const [message, setMessage] = useState("");
  const dirty = editing && draft !== base.markdown;
  const conflict = editing && base.revision !== document.revision;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return <div>
    <div className={styles.documentToolbar}>
      {!editing && <Button variant="outline" onClick={() => { setBase(document); setDraft(document.markdown); setEditing(true); setMessage(""); }}>Edit my style</Button>}
    </div>
    {editing ? <form onSubmit={async event => {
      event.preventDefault();
      if (await save(draft, base.revision)) { setUndo({markdown:base.markdown, revision:draft}); setEditing(false); setMessage("Saved."); }
    }}>
      <label htmlFor="style-document">My style · Markdown</label>
      <textarea id="style-document" className={styles.documentInput} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} rows={24} maxLength={100000} spellCheck />
      {conflict && <p role="alert">This document changed elsewhere.</p>}
      <div className={styles.documentToolbar}>
        <Button type="submit" disabled={busy || !dirty || conflict}>Save style</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => {setEditing(false); setMessage("");}}>{conflict ? "Discard draft and load latest" : "Cancel"}</Button>
      </div>
    </form> : <>
      {document.markdown.trim() ? <DocumentText text={document.markdown} /> : <p>No style defaults yet.</p>}
      {undo && undo.revision === document.markdown && <Button variant="ghost" disabled={busy} onClick={async () => {if (await save(undo.markdown, document.revision)) {setUndo(null);setMessage("Previous style restored.");}}}>Undo last save</Button>}
    </>}
    <p role="status">{message}</p>
  </div>;
}
