"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Highlighter, Link2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentSelection } from "@/components/desktop/ProjectReviewDock";
import { InspectorDisclosure } from "../timeline/InspectorHierarchy";
import { editScriptText, linkScriptVisuals, markScriptRange, readScriptDocument, unlinkScriptVisual, type ScriptDocument } from "@/lib/storyboard/script";
import type { StoryboardAsset } from "@/lib/storyboard/model";
import type { useStoryboard } from "./useStoryboard";
import { StoryboardPanelActions } from "./StoryboardPanels";
import styles from "./script-section.module.css";

export type ScriptRangeSelection = { start: number; end: number };
type Draft = { document: ScriptDocument; original: ScriptDocument };
const same = (a: ScriptRangeSelection, b: ScriptRangeSelection) => a.start === b.start && a.end === b.end;

/** The script with every section tinted and selected parts outlined, drawn under the transparent textarea. */
function Highlights({ text, marks, selected, scrollTop }: { text: string; marks: ScriptRangeSelection[]; selected: ScriptRangeSelection[]; scrollTop: number }) {
  const cuts = [...new Set([0, text.length, ...[...marks, ...selected].flatMap(r => [r.start, r.end])])].filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  return <div className={styles.highlights} aria-hidden="true"><div style={{ transform: `translateY(${-scrollTop}px)` }}>
    {cuts.slice(0, -1).map((start, i) => {
      const end = cuts[i + 1], inside = (r: ScriptRangeSelection) => r.start <= start && r.end >= end && r.end > r.start;
      const piece = text.slice(start, end);
      return selected.some(inside) ? <mark key={start} data-selected>{piece}</mark> : marks.some(inside) ? <mark key={start}>{piece}</mark> : <Fragment key={start}>{piece}</Fragment>;
    })}{"\n"}
  </div></div>;
}

/**
 * Script: freeform text with named sections. Highlighting words selects them for the agent (⌘/Ctrl adds
 * another part); the selection stays highlighted while visuals are picked in Media. Link puts the selected
 * visuals on the selected section. Everything saves on its own: after a short pause in typing, on leaving the
 * text, and right away for section and link changes; each save is one Undo step.
 */
export function ScriptSection({ api, selection, setSelection, mediaSelection, lookup }: {
  api: ReturnType<typeof useStoryboard>; selection: ScriptRangeSelection[]; setSelection: (next: ScriptRangeSelection[]) => void;
  mediaSelection: string[]; lookup: (source: string) => StoryboardAsset | undefined;
}) {
  const saved = readScriptDocument(api.snapshot!.content);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [start, setStart] = useState<number | null>(null), [end, setEnd] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const text = useRef<HTMLTextAreaElement>(null);
  const doc = draft?.document ?? saved;
  const change = (document: ScriptDocument) => setDraft({ document: { ...document, enabled: true }, original: draft?.original ?? saved });
  const clearPoints = () => { setStart(null); setEnd(null); setRenaming(null); };
  // Autosave. Saves queue in order, so each one is checked against the text the previous one wrote;
  // typing during a save continues on top of it. A section without a name waits until it has one.
  const draftRef = useRef(draft), apiRef = useRef(api), ownText = useRef<string | null>(null);
  draftRef.current = draft; apiRef.current = api;
  const flush = useCallback(() => {
    const pending = draftRef.current;
    if (!pending || JSON.stringify(pending.document) === JSON.stringify(pending.original) || pending.document.marks.some(m => !m.label.trim())) return;
    const sent = pending.document;
    ownText.current = sent.markdown;
    setDraft(d => d && { ...d, original: sent });
    void apiRef.current.saveScript(sent, pending.original, () => setDraft(d => d && d.document === sent ? null : d));
  }, []);
  useEffect(() => { if (!draft) return; const timer = window.setTimeout(flush, 800); return () => window.clearTimeout(timer); }, [draft, flush]);
  useEffect(() => () => flush(), [flush]);
  const commit = (document: ScriptDocument) => { change(document); window.setTimeout(flush, 0); };
  // Undo or another writer (the agent) can replace the text under a selection; our own saves cannot.
  useEffect(() => { if (!draft && saved.markdown !== ownText.current) { clearPoints(); setSelection([]); } ownText.current = null; }, [saved.markdown]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = start !== null && end !== null ? { start: Math.min(start, end), end: Math.max(start, end) } : null;
  const canMark = !!range && !!doc.markdown.slice(range.start, range.end).trim();
  const mark = () => {
    if (!range || !canMark || doc.marks.length >= 500) return;
    const id = crypto.randomUUID();
    commit(markScriptRange(doc, { id, label: doc.markdown.slice(range.start, range.end).trim().slice(0, 60), ...range }));
    setRenaming(id); setSectionsOpen(true);
  };
  const remove = (id: string) => { commit({ ...doc, marks: doc.marks.filter(x => x.id !== id) }); clearPoints(); };
  const pick = (next: ScriptRangeSelection, add: boolean) => setSelection(add ? selection.some(r => same(r, next)) ? selection.filter(r => !same(r, next)) : [...selection, next] : [next]);
  // A finished highlight (mouse or keyboard) becomes the selection; ⌘/Ctrl adds it to what is already selected.
  const select = (event: { currentTarget: HTMLTextAreaElement; metaKey: boolean; ctrlKey: boolean }) => {
    const { selectionStart: a, selectionEnd: b } = event.currentTarget, add = event.metaKey || event.ctrlKey;
    if (a !== b && doc.markdown.slice(a, b).trim()) pick({ start: a, end: b }, add);
    else if (!add) setSelection([]);
  };

  // Selected parts of the script appear in the selection tray and reach the agent.
  const replaceSelectionGroup = useAgentSelection()?.replaceSelectionGroup;
  useEffect(() => {
    if (!replaceSelectionGroup) return;
    replaceSelectionGroup("storyboard-script", selection.map(r => {
      const section = doc.marks.find(m => same(m, r)), quote = doc.markdown.slice(r.start, r.end);
      const short = quote.trim().replace(/\s+/g, " ");
      return { id: `storyboard-script:${r.start}-${r.end}`, group: "storyboard-script", kind: section ? "Script section" : "Script",
        label: section ? section.label : short.length > 48 ? `“${short.slice(0, 48)}…”` : `“${short}”`,
        agentText: `Script ${section ? `section "${section.label}" (section_id ${section.id})` : "text (not a section yet)"} at characters ${r.start}–${r.end}: "${quote.slice(0, 1200)}"${section?.visuals?.length ? `; linked visuals: ${section.visuals.join(", ")}` : ""}.`,
        onRemove: () => setSelection(selection.filter(item => !same(item, r))) };
    }));
  }, [replaceSelectionGroup, selection, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => replaceSelectionGroup?.("storyboard-script", []), [replaceSelectionGroup]);

  const visuals = mediaSelection.filter(source => { const kind = lookup(source)?.kind; return kind === "image" || kind === "video"; });
  const canLink = selection.length === 1 && visuals.length > 0;
  const link = () => {
    if (!canLink) return;
    const section = doc.marks.find(m => same(m, selection[0]));
    commit(linkScriptVisuals(doc, [section ? { id: section.id } : selection[0]], visuals));
    setSectionsOpen(true);
  };
  const name = (source: string) => lookup(source)?.name ?? source.split("/").pop() ?? source;

  return <section className={styles.section} aria-label="Script">
    <StoryboardPanelActions>
      <Button size="icon-sm" variant="ghost" aria-label="Link selected visuals to this part" title={canLink ? `Link ${visuals.length} selected ${visuals.length === 1 ? "visual" : "visuals"}` : "Link selected visuals"} disabled={!canLink} onMouseDown={event => event.preventDefault()} onClick={link}><Link2 /></Button>
      <Button size="icon-sm" variant="ghost" aria-label="Mark section" title="Mark section" disabled={!canMark || doc.marks.length >= 500} onMouseDown={event => event.preventDefault()} onClick={mark}><Highlighter /></Button>
    </StoryboardPanelActions>
    <div className={styles.document}>
      <div className={styles.writing}>
        <Highlights text={doc.markdown} marks={doc.marks} selected={selection} scrollTop={scrollTop} />
        <textarea id="storyboard-script-text" ref={text} aria-label="Script text" placeholder="Write or paste your script…" value={doc.markdown} maxLength={100000}
          onChange={e => { change(editScriptText(doc, e.target.value)); clearPoints(); setSelection([]); }}
          onSelect={e => { setStart(e.currentTarget.selectionStart); setEnd(e.currentTarget.selectionEnd); }}
          onMouseUp={select} onKeyUp={e => { if (e.shiftKey || e.key.startsWith("Arrow")) select(e); }}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)} onBlur={flush}
          onKeyDown={e => { if (e.key === "Escape" && selection.length) { e.preventDefault(); e.stopPropagation(); setSelection([]); } }} />
      </div>
      <InspectorDisclosure title={`Sections${doc.marks.length ? ` · ${doc.marks.length}` : ""}`} open={sectionsOpen} onOpenChange={setSectionsOpen}>
        {!doc.marks.length && <p className={styles.guidance}>Highlight text, then choose Mark section.</p>}
        <div className={styles.marks} aria-label="Marked sections">{doc.marks.map(m => <article key={m.id} className={styles.mark} data-selected={selection.some(r => same(r, m))} tabIndex={0} aria-label={m.label}
          onKeyDown={e => { if (e.target === e.currentTarget && ["Delete", "Backspace"].includes(e.key)) { e.preventDefault(); remove(m.id); } }}>
          <div className={styles.sectionText}>
            <button className={styles.quote} type="button" onClick={e => { pick({ start: m.start, end: m.end }, e.metaKey || e.ctrlKey); text.current?.setSelectionRange(m.start, m.end); setStart(m.start); setEnd(m.end); }}
              onDoubleClick={() => setRenaming(m.id)}><strong>{m.label}</strong><span>{m.quote}</span>{m.needsReview && <em>Review text</em>}</button>
            {renaming === m.id && <Input aria-label="Section name" value={m.label} maxLength={240} autoFocus onBlur={() => { setRenaming(null); flush(); }} onChange={event => change({ ...doc, marks: doc.marks.map(item => item.id === m.id ? { ...item, label: event.target.value } : item) })} />}
            {!!m.visuals?.length && <ul className={styles.linked} aria-label={`Visuals for ${m.label}`}>{m.visuals.map(source => <li key={source}>
              {lookup(source)?.preview && lookup(source)?.kind === "image" ? <img src={lookup(source)!.preview} alt="" /> : null}<span title={name(source)}>{name(source)}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`Unlink ${name(source)} from ${m.label}`} title="Unlink" onClick={() => commit(unlinkScriptVisual(doc, m.id, source))}><X /></Button>
            </li>)}</ul>}
          </div>
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.label}`} title="Remove section" onClick={() => remove(m.id)}><Trash2 /></Button>
        </article>)}</div>
      </InspectorDisclosure>
    </div>
  </section>;
}
